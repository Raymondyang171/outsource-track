#!/bin/bash
# scripts/pre-dev-check.sh

PORT=3000
echo "SOP: Checking if port $PORT is occupied..."

# lsof -t -i:$PORT silently returns the PID listening on the port.
# The output is captured into the PID variable.
PID=$(lsof -t -i:$PORT)

if [ -n "$PID" ]; then
  echo "--------------------------------------------------"
  echo "‼️ Error: Port $PORT is already in use."
  echo "Process with PID $PID is using it."
  echo ""
  echo "💡 Please stop the existing process before starting the development server."
  echo "You can use the following command to terminate it:"
  echo ""
  echo "    kill $PID"
  echo ""
  echo "--------------------------------------------------"
  exit 1 # Exit with a non-zero status to prevent `pnpm dev` from running.
else
  echo "✅ Port $PORT is clear. Starting development server..."
  echo "--------------------------------------------------"
fi

exit 0
