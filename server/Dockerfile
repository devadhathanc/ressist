# ---------- Stage 1: Build ----------
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Copy dependency files first
COPY go.mod go.sum ./
RUN go mod tidy

# Copy all source files
COPY . .

# Force a fully static binary (important for Alpine runtime)
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main ./main.go


# ---------- Stage 2: Runtime ----------
FROM scratch  

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /app/main .

EXPOSE 8080

# Run the static binary directly
ENTRYPOINT ["/app/main"]