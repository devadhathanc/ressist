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
    ContainerName string `json:"container_name"`
    DOI           string `json:"doi"`
    CreationDate  string `json:"creation_date"`
}

func main() {
	initRedis()
	http.HandleFunc("/api/create-session", withCORS(handleCreateSession))
	http.HandleFunc("/api/join-session", withCORS(handleJoinSession))
	http.HandleFunc("/api/chat", withCORS(handleChat))
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

func canCreateSession() (bool, error) {
	count, err := rdb.SCard(ctx, "active_sessions").Result()
	if err != nil {
		return false, err
	}
	return count < 10, nil
}

func initRedis() {
	_ = godotenv.Load("../.env")
	opt, _ := redis.ParseURL(os.Getenv("REDIS_URL"))
	rdb = redis.NewClient(opt)
	if _, err := rdb.Ping(ctx).Result(); err != nil {
		panic(err)
	}
}

// No cleanup goroutine needed; rely on Redis TTL expiration.

func handleCreateSession(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	ok, err := canCreateSession()
	if err != nil {
		http.Error(w, "Redis error", 500)
		return
	}
	if !ok {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(429)
		json.NewEncoder(w).Encode(map[string]string{"error": "max sessions reached"})
		return
	}
	
	r.ParseMultipartForm(10 << 20) // 10MB max
	doi := r.FormValue("doi")
	if doi == "" {
		doi = "0"
	}
	file, handler, fileErr := r.FormFile("pdf")

	// Generate session ID as YYMMHHSS
	now := time.Now()
	sessionID := now.Format("06011505")
	containerName := "worker-" + sessionID
	creationDate := now.Format("2006-01-02")

	session := Session{
		SessionID:     sessionID,
		ContainerName: containerName,
		DOI:           doi,
		CreationDate:  creationDate,
	}

	key := sessionID
	// Store session as Redis hash
	err = rdb.HSet(ctx, key, map[string]interface{}{
		"session_id":     session.SessionID,
		"container_name": session.ContainerName,
		"doi":            session.DOI,
		"creation_date":  session.CreationDate,
	}).Err()
	if err != nil {
		http.Error(w, "Failed to save session", 500)
		return
	}
	// Add to active_sessions set and set TTL for both hash and set membership
	rdb.SAdd(ctx, "active_sessions", sessionID)
	rdb.Expire(ctx, key, time.Hour)
	rdb.Expire(ctx, "active_sessions", time.Hour)

	sessionDir := filepath.Join("sessions", sessionID)
	os.MkdirAll(sessionDir, 0755)

	if doi != "" {
		pdfPath, err := fetchPDFByDOI(doi, sessionDir)
		if err != nil {
			http.Error(w, "Failed to fetch PDF from DOI: "+err.Error(), 400)
			return
		}
		fmt.Println("📄 Downloaded PDF:", pdfPath)
		go indexPDFtoQdrant(sessionID, pdfPath)
	} else if fileErr == nil {
		fmt.Println("📄 Received uploaded PDF:", handler.Filename)
		defer file.Close()
		dstPath := filepath.Join(sessionDir, handler.Filename)
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
		go indexPDFtoQdrant(sessionID, dstPath)
	} else {
		http.Error(w, "No valid DOI or PDF provided", 400)
		return
	}

	w.Write([]byte(fmt.Sprintf(`{"session_id": "%s", "creation_date" : "%s"}`, sessionID, now.Format("2006-01-02"))))
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

func fetchPDFByDOI(doi, sessionDir string) (string, error) {
	type UnpaywallResponse struct {
		BestOA struct {
			URLForPDF string `json:"url_for_pdf"`
		} `json:"best_oa_location"`
	}

	apiURL := fmt.Sprintf("https://api.unpaywall.org/v2/%s?email=tester@ressist.com", doi)
	resp, err := http.Get(apiURL)
	if err != nil {
		return "", fmt.Errorf("error fetching metadata from Unpaywall: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("Unpaywall API returned status %d", resp.StatusCode)
	}

	var data UnpaywallResponse
	err = json.NewDecoder(resp.Body).Decode(&data)
	if err != nil {
		return "", fmt.Errorf("error decoding Unpaywall response: %v", err)
	}

	pdfURL := data.BestOA.URLForPDF
	if pdfURL == "" {
		return "", fmt.Errorf("no PDF URL found for DOI")
	}

	pdfResp, err := http.Get(pdfURL)
	if err != nil {
		return "", fmt.Errorf("error downloading PDF: %v", err)
	}
	defer pdfResp.Body.Close()

	if pdfResp.StatusCode != 200 {
		return "", fmt.Errorf("PDF download returned status %d", pdfResp.StatusCode)
	}

	filePath := filepath.Join(sessionDir, "paper.pdf")
	outFile, err := os.Create(filePath)
	if err != nil {
		return "", fmt.Errorf("error creating PDF file: %v", err)
	}
	defer outFile.Close()

	_, err = io.Copy(outFile, pdfResp.Body)
	if err != nil {
		return "", fmt.Errorf("error saving PDF file: %v", err)
	}

	return filePath, nil
}

func indexPDFtoQdrant(sessionID, pdfPath string) {
	fmt.Println("🧠 Indexing PDF into Qdrant for session:", sessionID)

	cmd := exec.Command("/Users/devadhathan/Documents/codes/Projects/ressist/ressist/qdrant/venv/bin/python", "../qdrant/model.py")
	cmd.Env = append(os.Environ(),
		"SESSION_ID="+sessionID,
		"PDF_PATH="+pdfPath,
		"GEMINI_API_KEY="+os.Getenv("GEMINI_API_KEY"),
		"QDRANT_URL="+os.Getenv("QDRANT_URL"),
	)

	out, err := cmd.CombinedOutput()
	if err != nil {
		fmt.Println("❌ Error running model.py:", err, string(out))
		return
	}

	fmt.Println("✅ PDF successfully embedded and stored in Qdrant for session", sessionID)
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

	forwardReqBody, err := json.Marshal(req)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Failed to marshal request"})
		return
	}

	// Simplified forward request
	resp, err := http.Post("http://localhost:5000/chat", "application/json", bytes.NewReader(forwardReqBody))
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Failed to contact chat service"})
		return
	}
	defer resp.Body.Close()

	// Return response as-is
	body, _ := io.ReadAll(resp.Body)
	w.Write(body)
}