.PHONY: proto proto-go proto-ts clean-proto help

# Generate all protobuf code
proto: proto-go proto-ts

# Generate Go protobuf code
proto-go:
	@echo "Generating Go protobuf code..."
	@mkdir -p internal/proto/ws
	PATH="$(PATH):$(shell go env GOPATH)/bin" protoc --go_out=. \
		--go_opt=paths=source_relative \
		proto/ws_messages.proto
	@mv proto/ws_messages.pb.go internal/proto/ws/
	@echo "Go protobuf code generated successfully"

# Generate TypeScript protobuf code
proto-ts:
	@echo "Generating TypeScript protobuf code..."
	@mkdir -p internal/server/web/src/proto
	PATH="$(PATH):./internal/server/web/node_modules/.bin" protoc --es_out=internal/server/web/src/proto \
		--es_opt=target=ts \
		proto/ws_messages.proto
	@echo "TypeScript protobuf code generated successfully"

# Clean generated protobuf files
clean-proto:
	@echo "Cleaning generated protobuf files..."
	rm -rf internal/proto/ws/*.pb.go
	rm -rf internal/server/web/src/proto/*_pb.ts
	@echo "Cleaned protobuf files"

# Display help
help:
	@echo "Available targets:"
	@echo "  proto        - Generate all protobuf code (Go + TypeScript)"
	@echo "  proto-go     - Generate Go protobuf code only"
	@echo "  proto-ts     - Generate TypeScript protobuf code only"
	@echo "  clean-proto  - Remove generated protobuf files"
	@echo "  help         - Display this help message"
