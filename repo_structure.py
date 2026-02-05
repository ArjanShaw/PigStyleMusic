#!/usr/bin/env python3
import os
from pathlib import Path

def write_repo_structure_to_file(output_file="repo_structure.txt"):
    """Write actual repository structure to a text file."""
    directory = "/home/arjan-ubuntu/Documents/PigStyleMusic"
    base_path = Path(directory)
    
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(f"📁 Actual Directory Structure: {directory}\n")
            f.write("=" * 60 + "\n\n")
            
            def write_dir(path, prefix=""):
                try:
                    items = sorted(os.listdir(path))
                    for i, item in enumerate(items):
                        item_path = path / item
                        is_last = (i == len(items) - 1)
                        connector = "└── " if is_last else "├── "
                        
                        f.write(f"{prefix}{connector}{item}\n")
                        
                        if item_path.is_dir():
                            next_prefix = prefix + ("    " if is_last else "│   ")
                            write_dir(item_path, next_prefix)
                except (PermissionError, OSError) as e:
                    f.write(f"{prefix}    [Error accessing directory: {e}]\n")
            
            write_dir(base_path)
            
        print(f"✅ Repository structure saved to: {output_file}")
        print(f"📁 Location: {Path(output_file).absolute()}")
        
        # Also print a preview
        print("\n📋 First 20 lines of output:")
        with open(output_file, 'r', encoding='utf-8') as f:
            for i, line in enumerate(f):
                if i < 20:
                    print(line.rstrip())
                else:
                    print("...")
                    break
                    
    except Exception as e:
        print(f"❌ Error writing to file: {e}")

if __name__ == "__main__":
    # You can change the output filename here
    write_repo_structure_to_file("pigstyle_structure.txt")