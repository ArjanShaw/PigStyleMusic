#!/bin/bash
# Setup script for Winbond receipt printer (Vendor: 0416, Product: 5011)
# Run with: sudo ./setup_printer.sh

set -e

echo "=== Winbond Receipt Printer Setup ==="

# Check if printer is connected
if ! lsusb | grep -q "0416:5011"; then
    echo "❌ Printer not found (ID 0416:5011). Please plug it in and try again."
    exit 1
fi
echo "✅ Printer detected."

# Create udev rule
RULE_FILE="/etc/udev/rules.d/99-printer.rules"
echo "📝 Creating udev rule: $RULE_FILE"
cat > "$RULE_FILE" <<EOF
KERNEL=="lp*", SUBSYSTEM=="usb", ATTRS{idVendor}=="0416", ATTRS{idProduct}=="5011", MODE:="0666", SYMLINK+="pigstyle_printer"
EOF

# Reload udev
echo "🔄 Reloading udev rules..."
udevadm control --reload-rules
udevadm trigger --subsystem-match=usb --action=add

# Wait and check symlink
sleep 2
if [ -L /dev/pigstyle_printer ]; then
    echo "✅ Symlink created: $(ls -l /dev/pigstyle_printer)"
else
    echo "⚠️ Symlink not created. Try unplugging and re-plugging the printer."
fi

# Test printing
echo "🧪 Attempting test print..."
if printf '\x1B\x40Hello from PigStyle!\n' > /dev/pigstyle_printer 2>/dev/null; then
    echo "✅ Test print sent successfully!"
else
    echo "⚠️ Test print failed. You may need to check permissions or device path."
    echo "   Try: sudo chmod 666 /dev/pigstyle_printer"
fi

echo "=== Done ==="
echo "You can now use /dev/pigstyle_printer in your Flask API."