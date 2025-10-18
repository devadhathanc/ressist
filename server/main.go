package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"


	// "github.com/docker/docker/api/types/container"
	// "github.com/docker/docker/api/types/mount"
	// "github.com/docker/docker/client"
	"github.com/redis/go-redis/v9"
)

var (
	sessionCounter int
	counterMutex   sync.Mutex
	rdb             *redis.Client
	ctx             = context.Background()
)

func main() {
	rdb = redis.NewClient(&redis.Options{
		Addr:     "localhost:6379",
		Password: "", // no password
		DB:       0,  // default DB
	})

	_, err := rdb.Ping(ctx).Result()
	if err != nil {
		fmt.Println("❌ Redis connection failed:", err)
	} else {
		fmt.Println("✅ Connected to Redis")
	}
	http.HandleFunc("/api/create-session", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		if r.Method == http.MethodPost {
			handleCreateSession(w, r)
		} else if r.Method == http.MethodOptions {
			// Handle CORS preflight
			
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
	http.ListenAndServe(":8080", nil)
}


func handleCreateSession(w http.ResponseWriter, r *http.Request) {
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

	// Generate session ID (YYMMDDi)
	now := time.Now()
	dateStr := now.Format("060102")
	counterMutex.Lock()
	sessionCounter++
	count := sessionCounter
	counterMutex.Unlock()
	sessionID := fmt.Sprintf("%s%d", dateStr, count)
	

	sessionDir := filepath.Join("sessions", sessionID)
	os.MkdirAll(sessionDir, 0755)

	if doi != "" {
		pdfPath, err := fetchPDFByDOI(doi, sessionDir)
		if err != nil {
			http.Error(w, "Failed to fetch PDF from DOI: "+err.Error(), 400)
			return
		}
		fmt.Println("📄 Downloaded PDF:", pdfPath)
		// go analyzePaper(sessionID, pdfPath)
	} else if err == nil {
		defer file.Close()
		dst, _ := os.Create(filepath.Join(sessionDir, handler.Filename))
		io.Copy(dst, file)
		dst.Close()
		// go analyzePaper(sessionID, dst.Name())
	} else {
		http.Error(w, "No valid DOI or PDF provided", 400)
		return
	}

	w.Write([]byte(fmt.Sprintf(`{"session_id": "%s", "creation_date" : "%s"}`, sessionID, now.Format("2006-01-02"))))
	// json.NewEncoder(w).Encode(map[string]string{"session_id": sessionID})
}

func fetchPDFByDOI(doi, sessionDir string) (string, error) {
	type UnpaywallResponse struct {
		Title   string `json:"title"`
		BestOA  struct {
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

	// Save session metadata to Redis
	err = rdb.HSet(ctx, fmt.Sprintf("session:%s", filepath.Base(sessionDir)),
		"doi", doi,
		"title", data.Title,
	).Err()
	if err != nil {
		fmt.Println("❌ Failed to save metadata to Redis:", err)
	} else {
		fmt.Printf("💾 Stored session metadata → [%s]: \"%s\"\n", doi, data.Title)
	}

	// Download the PDF
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