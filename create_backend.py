# create_structure_report.py
import os

def write_structure_to_txt(start_path=".", output_file="folder_structure.txt", max_depth=None):
    """
    Write folder/file structure to a text file
    
    Args:
        start_path: Starting directory (default: current directory)
        output_file: Output text file name
        max_depth: Maximum depth to traverse (None for unlimited)
    """
    
    def _build_tree(path, prefix="", depth=0):
        """Recursively build tree structure"""
        tree_lines = []
        
        # Stop if max depth reached
        if max_depth is not None and depth >= max_depth:
            return tree_lines
        
        try:
            # Get all items in directory
            items = os.listdir(path)
            
            # Separate directories and files, sort them
            dirs = sorted([d for d in items if os.path.isdir(os.path.join(path, d))])
            files = sorted([f for f in items if os.path.isfile(os.path.join(path, f))])
            
            # Process directories
            for i, dir_name in enumerate(dirs):
                dir_path = os.path.join(path, dir_name)
                is_last_dir = (i == len(dirs) - 1) and (len(files) == 0)
                
                # Add directory line
                tree_lines.append(f"{prefix}{'└── ' if is_last_dir else '├── '}{dir_name}/")
                
                # Recursively process subdirectory
                extension = "    " if is_last_dir else "│   "
                tree_lines.extend(_build_tree(dir_path, prefix + extension, depth + 1))
            
            # Process files
            for i, file_name in enumerate(files):
                is_last_file = (i == len(files) - 1)
                
                # Add file line
                tree_lines.append(f"{prefix}{'└── ' if is_last_file else '├── '}{file_name}")
        
        except PermissionError:
            tree_lines.append(f"{prefix}└── [Permission Denied]")
        except Exception as e:
            tree_lines.append(f"{prefix}└── [Error: {str(e)}]")
        
        return tree_lines
    
    print(f"📁 Scanning structure from: {os.path.abspath(start_path)}")
    
    try:
        # Build the tree structure
        lines = []
        lines.append(f"📁 Directory Structure: {os.path.abspath(start_path)}")
        lines.append(f"📅 Generated: {os.path.basename(os.path.abspath(start_path))}")
        lines.append("=" * 60)
        lines.append("")
        lines.extend(_build_tree(start_path))
        
        # Write to file
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines))
        
        print(f"✅ Structure written to: {os.path.abspath(output_file)}")
        
        # Also print to console
        print("\n📋 Structure Preview:")
        print("=" * 60)
        for line in lines[:50]:  # Show first 50 lines
            print(line)
        if len(lines) > 50:
            print(f"... and {len(lines) - 50} more lines")
        
        # Show file count
        file_count = sum([len(files) for _, _, files in os.walk(start_path)])
        dir_count = sum([len(dirs) for _, dirs, _ in os.walk(start_path)])
        print(f"\n📊 Summary: {dir_count} directories, {file_count} files")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    
    return True

def create_multiple_reports():
    """Create reports for different directories"""
    
    reports = [
        (".", "current_directory_structure.txt"),
        ("pigstyle_frontend", "frontend_structure.txt"),
        ("pigstyle_project", "project_structure.txt"),
    ]
    
    for path, filename in reports:
        if os.path.exists(path):
            write_structure_to_txt(path, filename, max_depth=10)
            print()
        else:
            print(f"⚠️  Skipping {path} (does not exist)")

if __name__ == "__main__":
    # Create report for current directory
    write_structure_to_txt(".", "folder_structure.txt")
    
    # Uncomment to create multiple reports
    # create_multiple_reports()