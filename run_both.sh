#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
VENV_PATH="$SCRIPT_DIR/venv"

# Check if virtual environment exists
if [ ! -d "$VENV_PATH" ]; then
    echo "ERROR: Virtual environment not found at $VENV_PATH"
    echo "Please create a virtual environment first:"
    echo "  cd $SCRIPT_DIR && python3 -m venv venv"
    exit 1
fi

# Activate the virtual environment
source "$VENV_PATH/bin/activate"

echo "Using Python from: $(which python3)"
echo "Python version: $(python3 --version)"
echo "Flask version: $(python3 -c "import flask; print(flask.__version__)" 2>/dev/null || echo "Not installed")"

# ================================================
# RUN ENDPOINT HEALTH CHECK (Development only)
# ================================================
echo ""
echo "========================================="
echo "🔍 Running API Endpoint Health Check..."
echo "========================================="
echo ""

# Check if the endpoint analyzer exists
if [ -f "$SCRIPT_DIR/endpoint_analyzer.py" ]; then
    # Run the endpoint analyzer
    python3 "$SCRIPT_DIR/endpoint_analyzer.py" --dir "$SCRIPT_DIR"
    ANALYZER_EXIT=$?
    
    echo ""
    if [ $ANALYZER_EXIT -eq 0 ]; then
        echo "✅ Endpoint check passed! No issues found."
    else
        echo "⚠️  Endpoint issues detected. See details above."
        echo "   (Continuing with server startup...)"
    fi
else
    echo "⚠️  endpoint_analyzer.py not found. Skipping endpoint check."
    echo "   (Create endpoint_analyzer.py in the same directory to enable)"
fi

echo ""
echo "========================================="
echo "Starting servers..."
echo "========================================="
echo ""

# Start backend API
echo "Starting backend API on port 5000..."
cd "$SCRIPT_DIR/backend"
python3 api.py &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Start frontend website
echo "Starting frontend website on port 8000..."
cd "$SCRIPT_DIR/website"
python3 website_routes.py &
FRONTEND_PID=$!

echo ""
echo "✅ Both servers are running!"
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "Backend API: http://localhost:5000"
echo "Frontend Website: http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop both servers"

# Cleanup function
cleanup() {
    echo ""
    echo "🛑 Stopping servers..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    deactivate
    echo "✅ Servers stopped. Goodbye!"
    exit 0
}

# Trap Ctrl+C and other termination signals
trap cleanup INT TERM

# Wait indefinitely
wait