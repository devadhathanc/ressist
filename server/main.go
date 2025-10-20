package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"


	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/client"
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
	http.HandleFunc("/api/create-session", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", "default-src 'self'; connect-src http://localhost:8080")
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		if r.Method == http.MethodPost {
			handleCreateSession(w, r)
		} else if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusNoContent)
		} else {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusMethodNotAllowed)
			w.Write([]byte(`{"error":"Method not allowed"}`))
		}
	})
	fmt.Println("🚀 Server running on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		fmt.Printf("❌ Server failed to start: %v\n", err)
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
	ok, err := canCreateSession()
	if err != nil {
		http.Error(w, "Redis error", 500)
		return
	}
	if !ok {
		http.Error(w, "Maximum active sessions reached (10). Try again later.", 429)
		return
	}
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
	w.Header().Set("Content-Type", "application/json")

	r.ParseMultipartForm(10 << 20) // 10MB max
	doi := r.FormValue("doi")
	file, handler, err := r.FormFile("pdf")

	// Generate session ID as YYMMDDHHMM
	now := time.Now()
	sessionID := now.Format("0601021504")
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
		go analyzePaper(sessionID, pdfPath)
	} else if err == nil {
		defer file.Close()
		dst, _ := os.Create(filepath.Join(sessionDir, handler.Filename))
		io.Copy(dst, file)
		dst.Close()
		go analyzePaper(sessionID, dst.Name())
	} else {
		http.Error(w, "No valid DOI or PDF provided", 400)
		return
	}

	w.Write([]byte(fmt.Sprintf(`{"session_id": "%s", "creation_date" : "%s"}`, sessionID, now.Format("2006-01-02"))))
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

func analyzePaper(sessionID, pdfPath string) {
	fmt.Println("🧠 Launching Docker worker for session:", sessionID)

	cli, err := client.NewClientWithOpts(client.FromEnv)
	if err != nil {
		fmt.Println("Docker client error:", err)
		return
	}

	ctx := context.Background()

	absSource, err := filepath.Abs(filepath.Dir(pdfPath))
	if err != nil {
		fmt.Println("Error resolving absolute path:", err)
		return
	}
	resp, err := cli.ContainerCreate(ctx,
		&container.Config{
			Image: "paper-processor:latest",
			Cmd:   []string{"--session", sessionID, "--file", "/data/paper.pdf"},
		},
		&container.HostConfig{
			Mounts: []mount.Mount{
				{
					Type:   mount.TypeBind,
					Source: absSource,
					Target: "/data",
				},
			},
		}, nil, nil, "worker-"+sessionID)

	if err != nil {
		fmt.Println("Error creating container:", err)
		return
	}

	if err := cli.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		fmt.Println("Error starting container:", err)
		return
	}

	fmt.Println("✅ Worker started for session", sessionID)
}