#!/usr/bin/env python3
import os
from pathlib import Path

def write_repo_structure_to_file(output_file="repo_structure.txt"):
    """Write repository structure with only project code files to a text file."""
    directory = "/home/arjan-ubuntu/Documents/PigStyleMusic"
    base_path = Path(directory)
    
    # File extensions to include
    code_extensions = {'.py', '.css', '.html', '.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.txt'}
    
    # Directories to exclude (development/build directories)
    exclude_dirs = {'.git', '__pycache__', 'venv', 'env', '.env', 'node_modules', 
                   'dist', 'build', '.idea', '.vscode', '.pytest_cache', 
                   'migrations', 'staticfiles', 'media', 'logs', 'tmp', 'temp'}
    
    # Files to exclude
    exclude_files = {'.gitignore', 'requirements.txt', 'package-lock.json', 
                    'yarn.lock', 'poetry.lock', 'Pipfile.lock', '.env.example',
                    'README.md', 'LICENSE'}
    
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(f"📁 Project Code Structure: {directory}\n")
            f.write("=" * 60 + "\n\n")
            
            def write_dir(path, prefix=""):
                try:
                    # Get all items and filter
                    items = []
                    for item in os.listdir(path):
                        item_path = path / item
                        
                        # Skip excluded directories
                        if item in exclude_dirs:
                            continue
                            
                        if item_path.is_dir():
                            items.append((item, True))  # (name, is_dir)
                        else:
                            # Skip excluded files
                            if item in exclude_files:
                                continue
                            # Only include files with code extensions
                            if item_path.suffix.lower() in code_extensions:
                                items.append((item, False))
                    
                    # Sort alphabetically, directories first
                    items.sort(key=lambda x: (not x[1], x[0].lower()))  # dirs first, then alpha
                    
                    for i, (item, is_dir) in enumerate(items):
                        is_last = (i == len(items) - 1)
                        connector = "└── " if is_last else "├── "
                        
                        f.write(f"{prefix}{connector}{item}\n")
                        
                        if is_dir:
                            next_prefix = prefix + ("    " if is_last else "│   ")
                            write_dir(path / item, next_prefix)
                except (PermissionError, OSError) as e:
                    f.write(f"{prefix}    [Error accessing directory: {e}]\n")
            
            write_dir(base_path)
            
        print(f"✅ Project code structure saved to: {output_file}")
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