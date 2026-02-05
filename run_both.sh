#!/bin/bash

# Get the full path to your project directory
PROJECT_DIR="/home/arjan-ubuntu/Documents/PigStyleMusic"
VENV_PATH="$PROJECT_DIR/venv"

# Check if virtual environment exists
if [ ! -d "$VENV_PATH" ]; then
    echo "ERROR: Virtual environment not found at $VENV_PATH"
    echo "Please create a virtual environment first:"
    echo "  cd $PROJECT_DIR && python3 -m venv venv"
    exit 1
fi

# Activate the virtual environment
source "$VENV_PATH/bin/activate"

echo "Using Python from: $(which python3)"
echo "Python version: $(python3 --version)"
echo "Flask version: $(python3 -c "import flask; print(flask.__version__)" 2>/dev/null || echo "Not installed")"

# Start backend API
echo ""
echo "Starting backend API on port 5000..."
cd "$PROJECT_DIR/backend"
python3 api.py &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Start frontend website
echo "Starting frontend website on port 8000..."
cd "$PROJECT_DIR/website"
python3 website_routes.py &
FRONTEND_PID=$!

echo ""
echo "Both servers are running!"
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "Backend API: http://localhost:5000"
echo "Frontend Website: http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop both servers"

# Deactivate virtual environment when done
trap "echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID; deactivate; exit" INT

# Wait indefinitely
wait