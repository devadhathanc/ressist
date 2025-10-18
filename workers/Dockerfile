# Use a lightweight Python base image
FROM python:3.10-slim

# Set working directory inside container
WORKDIR /app

# Copy dependency file first (for better layer caching)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the worker files
COPY . .

# Default entrypoint (run the analyzer script)
ENTRYPOINT ["python", "paperAnalyzer.py"]