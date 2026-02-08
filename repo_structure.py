#!/usr/bin/env python3
import os
from pathlib import Path

def write_repo_structure_to_file(output_file="repo_structure.txt"):
    """Write repository structure with complete code file contents to a text file."""
    directory = "/home/arjan-ubuntu/Documents/PigStyleMusic"
    base_path = Path(directory)
    
    # File extensions to include (all code/text files)
    code_extensions = {'.py', '.css', '.html', '.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.txt', 
                      '.yml', '.yaml', '.xml', '.csv', '.sql', '.sh', '.bash', '.php', '.java', 
                      '.c', '.cpp', '.h', '.hpp', '.go', '.rs', '.rb', '.pl', '.pm', '.lua', 
                      '.scss', '.less', '.sass', '.vue', '.svelte'}
    
    # Directories to exclude (development/build directories)
    exclude_dirs = {'.git', '__pycache__', 'venv', 'env', '.env', 'node_modules', 
                   'dist', 'build', '.idea', '.vscode', '.pytest_cache', 
                   'migrations', 'staticfiles', 'media', 'logs', 'tmp', 'temp',
                   '.next', '.nuxt', 'out', 'coverage', '.cache', '.parcel-cache',
                   '.svelte-kit', '.astro'}
    
    # Files to exclude (config/package files, not actual source code)
    exclude_files = {'.gitignore', 'package-lock.json', 'yarn.lock', 'poetry.lock', 
                    'Pipfile.lock', '.env.example', '.DS_Store', 'Thumbs.db',
                    '*.pyc', '*.pyo', '*.pyd', '*.so', '*.dll', '*.exe'}
    
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(f"📁 PROJECT CODE STRUCTURE WITH COMPLETE FILE CONTENTS\n")
            f.write(f"📂 Directory: {directory}\n")
            f.write("=" * 80 + "\n\n")
            
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
                            # Skip excluded file patterns
                            skip = False
                            for pattern in exclude_files:
                                if pattern.startswith('*'):
                                    if item.endswith(pattern[1:]):
                                        skip = True
                                        break
                                elif item == pattern:
                                    skip = True
                                    break
                            
                            if skip:
                                continue
                                
                            # Only include files with code extensions or no extension (potential scripts)
                            if item_path.suffix.lower() in code_extensions or item_path.suffix == '':
                                items.append((item, False))
                    
                    # Sort alphabetically, directories first
                    items.sort(key=lambda x: (not x[1], x[0].lower()))
                    
                    for i, (item, is_dir) in enumerate(items):
                        is_last = (i == len(items) - 1)
                        connector = "└── " if is_last else "├── "
                        
                        f.write(f"{prefix}{connector}{item}\n")
                        
                        if is_dir:
                            next_prefix = prefix + ("    " if is_last else "│   ")
                            write_dir(path / item, next_prefix)
                        else:
                            # Write the complete contents of the file
                            file_path = path / item
                            try:
                                with open(file_path, 'r', encoding='utf-8', errors='ignore') as file_content:
                                    content = file_content.read()
                                    
                                # Only include file content if it's not too large (prevent huge outputs)
                                if len(content) > 1000000:  # 1MB limit
                                    f.write(f"{prefix}    {'    ' if is_last else '│   '}⚠️  [FILE TOO LARGE TO DISPLAY - {len(content)} characters]\n")
                                else:
                                    f.write(f"{prefix}    {'    ' if is_last else '│   '}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
                                    f.write(f"{prefix}    {'    ' if is_last else '│   '}📄 FILE: {item}\n")
                                    f.write(f"{prefix}    {'    ' if is_last else '│   '}📏 SIZE: {len(content)} characters\n")
                                    f.write(f"{prefix}    {'    ' if is_last else '│   '}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n")
                                    
                                    # Write content with proper indentation
                                    lines = content.split('\n')
                                    for line_num, line in enumerate(lines, 1):
                                        # Add line numbers and indent
                                        line_num_str = f"{line_num:4d} │ "
                                        indent = f"{prefix}    {'    ' if is_last else '│   '}"
                                        f.write(f"{indent}{line_num_str}{line}\n")
                                    
                                    f.write(f"{prefix}    {'    ' if is_last else '│   '}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
                                    f.write(f"{prefix}    {'    ' if is_last else '│   '}📄 END OF FILE: {item}\n\n")
                            except (PermissionError, UnicodeDecodeError, OSError) as e:
                                f.write(f"{prefix}    {'    ' if is_last else '│   '}❌ [Error reading file: {e}]\n\n")
                except (PermissionError, OSError) as e:
                    f.write(f"{prefix}    [Error accessing directory: {e}]\n")
            
            # Write the structure
            write_dir(base_path)
            
        print(f"✅ Project code structure with COMPLETE file contents saved to: {output_file}")
        print(f"📁 Location: {Path(output_file).absolute()}")
        
        # Show file stats
        output_size = Path(output_file).stat().st_size
        print(f"📊 Output file size: {output_size:,} bytes ({output_size/1024/1024:.2f} MB)")
        
        # Print a preview of the output
        print("\n📋 First 30 lines of output:")
        print("-" * 50)
        with open(output_file, 'r', encoding='utf-8') as f:
            for i, line in enumerate(f):
                if i < 30:
                    print(line.rstrip())
                else:
                    print("...")
                    print(f"\n✨ Full output available at: {Path(output_file).absolute()}")
                    break
                    
    except Exception as e:
        print(f"❌ Error writing to file: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # Write complete code files
    write_repo_structure_to_file("pigstyle_complete_code.txt")