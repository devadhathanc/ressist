FROM golang:1.24.0 AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/server .

FROM alpine:3.18
RUN apk add --no-cache ca-certificates docker-cli
COPY --from=builder /bin/server /bin/server
EXPOSE 8080
ENTRYPOINT ["/bin/server"]
