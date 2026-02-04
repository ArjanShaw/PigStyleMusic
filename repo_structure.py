import os
from pathlib import Path

def simple_repo_structure():
    """Show actual repository structure."""
    directory = "/home/arjan-ubuntu/Documents/PigStyleMusic"
    base_path = Path(directory)
    
    print("📁 Actual Directory Structure:", directory)
    print("=" * 60)
    
    def print_dir(path, prefix=""):
        try:
            items = sorted(os.listdir(path))
            for i, item in enumerate(items):
                item_path = path / item
                is_last = (i == len(items) - 1)
                connector = "└── " if is_last else "├── "
                
                print(f"{prefix}{connector}{item}")
                
                if item_path.is_dir():
                    next_prefix = prefix + ("    " if is_last else "│   ")
                    print_dir(item_path, next_prefix)
        except (PermissionError, OSError):
            pass
    
    print_dir(base_path)

if __name__ == "__main__":
    simple_repo_structure()