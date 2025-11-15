package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/joho/godotenv"
)

var (
	rdb *redis.Client
	ctx = context.Background()
)
type Session struct {
    SessionID     string `json:"session_id"`
    DOI           string `json:"doi"`
    Title         string `json:"title"`
    Journal       string `json:"journal"`
	JsonResponse  string `json:"json_response"`
}

type ChatMessage struct {
    Sender   string `json:"sender"`
    Question string `json:"question"`
    Time     string `json:"time"`
    Response string `json:"response"`
}

func main() {
	initRedis()
	http.HandleFunc("/api/create-session", withCORS(handleCreateSession))
	http.HandleFunc("/api/join-session", withCORS(handleJoinSession))
	http.HandleFunc("/api/chat", withCORS(handleChat))
	http.HandleFunc("/api/chat-history", withCORS(handleChatHistory))
	http.HandleFunc("/api/active-sessions", withCORS(handleActiveSessions))
	go cleanupExpiredSessions()
	fmt.Println("🚀 Server running on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		fmt.Printf("❌ Server failed to start: %v\n", err)
	}
}

func withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", "default-src 'self'; connect-src http://localhost:8080")
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

func initRedis() {
	// docker version 1/4
	// _ = godotenv.Load(".env")
	_ = godotenv.Load("../.env")
	opt, _ := redis.ParseURL(os.Getenv("REDIS_URL"))
	rdb = redis.NewClient(opt)
	if _, err := rdb.Ping(ctx).Result(); err != nil {
		panic(err)
	}
}



func handleCreateSession(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	keys,err := rdb.Keys(ctx, "*").Result()
	if err != nil {
		http.Error(w, "Redis error", 500)
		return
	}
	if len(keys) >= 10 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(429)
		json.NewEncoder(w).Encode(map[string]string{"error": "max sessions reached"})
		return
	}
	r.ParseMultipartForm(10 << 20) // 10MB max
	doi := r.FormValue("doi")
	file, handler, fileErr := r.FormFile("pdf")

	// Generate session ID as YYMMHHSS
	now := time.Now()
	sessionID := now.Format("06011505")

	session := Session{
		SessionID:     sessionID,
		DOI:           doi,
	}

	key := sessionID

	//docker version 2/4
	// sessionDir := "/app/sessions"
	sessionDir := "sessions"
	os.MkdirAll(sessionDir, 0755)
	if doi != "" {
		pdfPath, title, journal, jsonResponse, err := fetchPDFByDOI(doi, sessionDir, sessionID)
		if err != nil {
			fmt.Println("❌ Failed to fetch PDF from DOI:", err)
			http.Error(w, "Failed to fetch PDF from DOI: "+err.Error(), 400)
			return
		}
		session.Title = title
		session.Journal = journal
		session.JsonResponse = jsonResponse
		fmt.Println("📄 Downloaded PDF:", pdfPath)
		indexPDFtoQdrant(sessionID, pdfPath, session.JsonResponse)
	} else if fileErr == nil {
		fmt.Println("📄 Received uploaded PDF:", handler.Filename)
		defer file.Close()
		dstPath := filepath.Join(sessionDir, sessionID+".pdf")
		fmt.Println("💾 Preparing to save uploaded PDF to:", dstPath)
		dst, err := os.Create(dstPath)
		if err != nil {
			http.Error(w, "Failed to save uploaded PDF: "+err.Error(), 500)
			return
		}
		defer dst.Close()
		_, err = io.Copy(dst, file)
		if err != nil {
			http.Error(w, "Error writing PDF file: "+err.Error(), 500)
			return
		}
		indexPDFtoQdrant(sessionID, dstPath, "")
	} else {
		http.Error(w, "No valid DOI or PDF provided", 400)
		return
	}

	err = rdb.HSet(ctx, key, map[string]interface{}{
		"session_id":     session.SessionID,
		"doi":            session.DOI,
		"title":          session.Title,
		"journal":        session.Journal,
		"json_response":  session.JsonResponse,
	}).Err()
	if err != nil {
		http.Error(w, "Failed to save session", 500)
		return
	}

	rdb.Expire(ctx, key, time.Hour)

	w.Write([]byte(fmt.Sprintf(`{"session_id": "%s", "title": "%s", "journal" : "%s"}`, sessionID, session.Title, session.Journal)))
}

func handleJoinSession(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]string{"error": "Method not allowed"})
		return
	}

	var req struct {
		SessionID string `json:"session_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.SessionID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request body"})
		return
	}

	exists, err := rdb.Exists(ctx, req.SessionID).Result()
	if err != nil {
		w.WriteHeader(500)
		json.NewEncoder(w).Encode(map[string]string{"error": "Redis error"})
		return
	}
	if exists == 0 {
		w.WriteHeader(404)
		json.NewEncoder(w).Encode(map[string]string{"error": "Session not found"})
		return
	}

	// Retrieve session details
	sessionData, err := rdb.HGetAll(ctx, req.SessionID).Result()
	if err != nil {
		w.WriteHeader(500)
		json.NewEncoder(w).Encode(map[string]string{"error": "Failed to retrieve session"})
		return
	}

	json.NewEncoder(w).Encode(sessionData)
}

func fetchPDFByDOI(doi, sessionDir ,sessionID string) (string, string, string, string, error) {
	type UnpaywallResponse struct {
		OpenAccess bool `json:"is_oa"`
		Title      string `json:"title"`
		Journal    string `json:"journal_name"`	
		BestOA struct {
			URLForPDF string `json:"url_for_pdf"`
		} `json:"best_oa_location"`
		RawJSON json.RawMessage `json:"-"`
	}

	apiURL := fmt.Sprintf("https://api.unpaywall.org/v2/%s?email=tester@ressist.com", doi)
	resp, err := http.Get(apiURL)
	if err != nil {
		return "", "", "", "", fmt.Errorf("error fetching metadata from Unpaywall: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", "", "", "", fmt.Errorf("Unpaywall API returned status %d", resp.StatusCode)
	}

	var data UnpaywallResponse
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", "", "", "", fmt.Errorf("error reading Unpaywall response body: %v", err)
	}

	err = json.Unmarshal(bodyBytes, &data)
	if err != nil {
		return "", "", "", "", fmt.Errorf("error decoding Unpaywall response: %v", err)
	}

	data.RawJSON = json.RawMessage(bodyBytes)

	if !data.OpenAccess {
		return "", "", "", "", fmt.Errorf("No Open Access available for this paper")
	}

	pdfURL := data.BestOA.URLForPDF
	if pdfURL == "" {
		return "", "", "", "", fmt.Errorf("No PDF available for this paper")
	}

	pdfResp, err := http.Get(pdfURL)
	if err != nil {
		return "", "", "", "", fmt.Errorf("error downloading PDF: %v", err)
	}
	defer pdfResp.Body.Close()

	if pdfResp.StatusCode != 200 {
		return "", "", "", "", fmt.Errorf("PDF download returned status %d", pdfResp.StatusCode)
	}

	filePath := sessionDir + "/" + sessionID + ".pdf"
	outFile, err := os.Create(filePath)
	if err != nil {
		return "", "", "", "", fmt.Errorf("error creating PDF file: %v", err)
	}
	defer outFile.Close()

	_, err = io.Copy(outFile, pdfResp.Body)
	if err != nil {
		return "", "", "", "", fmt.Errorf("error saving PDF file: %v", err)
	}
	fmt.Println("💾 PDF saved to:", filePath)

	rawJSON, err := json.Marshal(data)
	if err != nil {
		return "", "", "", "", fmt.Errorf("error marshaling Unpaywall response: %v", err)
	}

	return filePath, data.Title, data.Journal, string(rawJSON), nil
}

func indexPDFtoQdrant(sessionID, pdfPath string, jsonResponse string) {
	fmt.Println("🧠 Indexing PDF into Qdrant for session:", sessionID)

	cmd := exec.Command("/Users/devadhathan/Documents/codes/Projects/ressist/ressist/qdrant/venv/bin/python", "../qdrant/model.py")
	envVars := []string{
		"SESSION_ID=" + sessionID,
		"PDF_PATH=" + pdfPath,
		"UNPAYWALL_JSON="+jsonResponse,
	}
	
	cmd.Env = append(os.Environ(), envVars...)

	//docker version 3/4

	// containerPDFPath := fmt.Sprintf("/app/sessions/%s.pdf", sessionID)

	// cmd := exec.Command(
	// 	"docker", "exec",
	// 	"-e", "SESSION_ID="+sessionID,
	// 	"-e", "PDF_PATH="+containerPDFPath,
	// 	"-e", "UNPAYWALL_JSON="+jsonResponse,
	// 	"qdrant-worker",
	// 	"python", "/app/model.py",
	// )
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	err := cmd.Run()
	if err != nil {
		fmt.Println("❌ Error running model.py:", err)
		return
	}

	fmt.Println("✅ PDF successfully embedded and stored in Qdrant for session", sessionID)
}

func storeMessage(sessionID string, msg ChatMessage) error {
    // Fetch existing messages
    existing, err := rdb.HGet(ctx, sessionID, "chats").Result()
    if err != nil && err != redis.Nil {
        return err
    }

    var messages []ChatMessage
    if existing != "" {
        json.Unmarshal([]byte(existing), &messages)
    }

    // Append the new message
    messages = append(messages, msg)

    // Marshal and store back
    data, err := json.Marshal(messages)
    if err != nil {
        return err
    }

    return rdb.HSet(ctx, sessionID, "chats", data).Err()
}
func handleActiveSessions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Get all active session IDs
	sessionIDs, err := rdb.Keys(ctx, "*").Result()
	if err != nil {
		http.Error(w, "Failed to fetch active sessions", 500)
		return
	}
	var sessions []map[string]interface{}
	for _, id := range sessionIDs {
		data, err := rdb.HGetAll(ctx, id).Result()
		if err != nil || len(data) == 0 {
			continue // skip if failed or missing
		}
		ttl, err := rdb.TTL(ctx, id).Result()
		if err != nil {
			ttl = 0
		}

		sessions = append(sessions, map[string]interface{}{
			"session_id":  data["session_id"],
			"ttl_seconds": int(ttl.Seconds()),
		})
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"sessions": sessions,
	})
}

func getChatHistory(sessionID string) ([]ChatMessage, error) {
    val, err := rdb.HGet(ctx, sessionID, "chats").Result()
    if err != nil && err != redis.Nil {
        return nil, err
    }
    if val == "" {
        return []ChatMessage{}, nil
    }

    var messages []ChatMessage
    json.Unmarshal([]byte(val), &messages)
    return messages, nil
}

func handleChat(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")

    if r.Method != http.MethodPost {
        w.WriteHeader(http.StatusMethodNotAllowed)
        json.NewEncoder(w).Encode(map[string]string{"error": "Method not allowed"})
        return
    }

    var req struct {
        SessionID string `json:"session_id"`
        Question  string `json:"question"`
    }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.SessionID == "" || req.Question == "" {
        w.WriteHeader(http.StatusBadRequest)
        json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request body"})
        return
    }


    fmt.Println("💬 Running chat_api.py for session:", req.SessionID)
    cmd := exec.Command("/Users/devadhathan/Documents/codes/Projects/ressist/ressist/qdrant/venv/bin/python", "../qdrant/chat_api.py")
	
    cmd.Env = append(os.Environ(),
        "SESSION_ID="+req.SessionID,	
        "QUESTION="+req.Question,
    )

	//docker version 4/4

	// cmd := exec.Command(
	// 	"docker", "exec",
	// 	"-e", "SESSION_ID="+req.SessionID,
	// 	"-e", "QUESTION="+req.Question,
	// 	"qdrant-worker",
	// 	"python", "/app/chat_api.py",
	// 	)

	
    var out bytes.Buffer
    cmd.Stdout = &out
    cmd.Stderr = &out
    err := cmd.Run()
    if err != nil {
        fmt.Println("❌ Error running chat_api.py:", err)
        fmt.Println("Output:", out.String())
        http.Error(w, "Error executing chat service", 500)
        return
    }

    fmt.Println("✅ chat_api.py executed successfully for session", req.SessionID)

    // Parse JSON returned by chat_api.py
    var botResp struct {
        Answer string `json:"answer"`
    }
    if err := json.Unmarshal(out.Bytes(), &botResp); err != nil {
        fmt.Println("❌ Failed to parse bot response:", err)
        http.Error(w, "Invalid bot response", 500)
        return
    }

    // Store bot response in Redis
    chatMsg := ChatMessage{
		Sender:   "user",
        Question: req.Question,
        Time:     time.Now().Format(time.RFC3339),
        Response: botResp.Answer,
    }
    storeMessage(req.SessionID, chatMsg)

    // Send response to frontend
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(botResp)
}

func handleChatHistory(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
	
    sessionID := r.URL.Query().Get("session_id")
    if sessionID == "" {
        http.Error(w, "Missing session_id", 400)
        return
    }
    messages, err := getChatHistory(sessionID)
    if err != nil {
        http.Error(w, "Failed to fetch chat history", 500)
        return
    }
	title, _ := rdb.HGet(ctx, sessionID, "title").Result()
    journal, _ := rdb.HGet(ctx, sessionID, "journal").Result()
    response := map[string]interface{}{
        "title":    title,
        "journal":  journal,
        "messages": messages,
    }

    json.NewEncoder(w).Encode(response)
}

func cleanupExpiredSessions() {
	for {
		time.Sleep(5 * time.Minute)

		sessionIDs, _ := rdb.Keys(ctx, "*").Result()
		sessionsJSON, _ := json.Marshal(sessionIDs)

		cmd := exec.Command(	
			"/Users/devadhathan/Documents/codes/Projects/ressist/ressist/qdrant/venv/bin/python",
			"../qdrant/delete_collection.py",
			string(sessionsJSON),
		)

		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		cmd.Run()
	}
}