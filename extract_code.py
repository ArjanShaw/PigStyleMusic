import os
import sys
import argparse
from datetime import datetime
from pathlib import Path

def extract_code_from_folder(folder_path, output_file, include_extensions=None, exclude_folders=None):
    """
    Extract code from specified file types in a folder and save to a text file.
    """
    if include_extensions is None:
        include_extensions = ['.py', '.js', '.css', '.html', '.htm', '.jsx', '.ts', '.tsx']
    
    if exclude_folders is None:
        exclude_folders = ['__pycache__', 'node_modules', '.git', 'venv', '.env', 'dist', 'build']
    
    folder_path = Path(folder_path).resolve()
    
    if not folder_path.exists():
        print(f"Error: Folder '{folder_path}' does not exist.")
        return False
    
    print(f"Scanning folder: {folder_path}")
    print(f"Including extensions: {include_extensions}")
    print(f"Excluding folders: {exclude_folders}")
    
    try:
        with open(output_file, 'w', encoding='utf-8') as out_file:
            # Write header
            out_file.write("=" * 80 + "\n")
            out_file.write(f"CODE EXTRACTION REPORT\n")
            out_file.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            out_file.write(f"Source Folder: {folder_path}\n")
            out_file.write(f"Included Extensions: {', '.join(include_extensions)}\n")
            out_file.write("=" * 80 + "\n\n")
            
            file_count = 0
            total_size = 0
            
            for root, dirs, files in os.walk(folder_path):
                # Skip excluded folders
                dirs[:] = [d for d in dirs if d not in exclude_folders]
                
                for file in files:
                    file_path = Path(root) / file
                    file_ext = file_path.suffix.lower()
                    
                    if file_ext in include_extensions:
                        try:
                            # Calculate relative path
                            relative_path = file_path.relative_to(folder_path)
                            
                            # Skip the output file itself if it's in the same folder
                            if file_path.name == output_file:
                                continue
                            
                            # Read file content
                            with open(file_path, 'r', encoding='utf-8') as f:
                                content = f.read()
                            
                            # Write file info to output
                            out_file.write("\n" + "=" * 60 + "\n")
                            out_file.write(f"FILE: {relative_path}\n")
                            out_file.write(f"TYPE: {file_ext}\n")
                            out_file.write(f"SIZE: {len(content):,} characters\n")
                            out_file.write("=" * 60 + "\n\n")
                            
                            # Write the actual code
                            out_file.write(content)
                            
                            # Add file footer
                            out_file.write("\n" + "=" * 60 + "\n")
                            out_file.write(f"END OF: {relative_path}\n")
                            out_file.write("=" * 60 + "\n\n")
                            
                            file_count += 1
                            total_size += len(content)
                            
                            print(f"✓ Processed: {relative_path}")
                            
                        except UnicodeDecodeError:
                            print(f"  Skipped (encoding issue): {file_path}")
                        except Exception as e:
                            print(f"  Error reading {file_path}: {e}")
            
            # Write summary
            out_file.write("\n" + "=" * 80 + "\n")
            out_file.write(f"SUMMARY\n")
            out_file.write(f"Total Files Processed: {file_count}\n")
            out_file.write(f"Total Characters: {total_size:,}\n")
            out_file.write(f"Output File: {Path(output_file).resolve()}\n")
            out_file.write("=" * 80 + "\n")
            
            print(f"\n✅ Processed {file_count} files with {total_size:,} total characters")
            print(f"Output saved to: {Path(output_file).resolve()}")
            
        return True
        
    except Exception as e:
        print(f"Error creating output file: {e}")
        return False

def main():
    # Get the directory where this script is located
    script_dir = Path(__file__).parent.resolve()
    
    parser = argparse.ArgumentParser(
        description='Extract code from a folder and save to a text file. '
                    f'Defaults to scanning the script\'s directory: {script_dir}'
    )
    
    # Make folder optional - default to script's directory
    parser.add_argument('folder', nargs='?', default=str(script_dir),
                       help=f'Path to the folder to scan (default: script directory: {script_dir})')
    
    parser.add_argument('-o', '--output', default='code_extract.txt',
                       help='Output file name (default: code_extract.txt)')
    
    parser.add_argument('-e', '--extensions', nargs='+',
                       default=['.py', '.js', '.css', '.html', '.htm', '.jsx', '.ts', '.tsx'],
                       help='File extensions to include (space-separated)')
    
    parser.add_argument('-x', '--exclude', nargs='+',
                       default=['__pycache__', 'node_modules', '.git', 'venv', '.env', 'dist', 'build'],
                       help='Folders to exclude (space-separated)')
    
    parser.add_argument('--no-skip-self', action='store_true',
                       help='Do not skip this script file in the output')
    
    args = parser.parse_args()
    
    print(f"Starting code extraction...")
    print(f"Script location: {script_dir}")
    print(f"Scanning folder: {args.folder}")
    print(f"Output file: {args.output}")
    print(f"Included extensions: {args.extensions}")
    print(f"Excluded folders: {args.exclude}")
    
    # Add this script to exclude list unless specified otherwise
    if not args.no_skip_self and Path(__file__).name != args.output:
        # Don't include the extraction script itself in the output
        script_name = Path(__file__).name
        print(f"Note: Skipping this script file: {script_name}")
    
    success = extract_code_from_folder(
        args.folder,
        args.output,
        include_extensions=args.extensions,
        exclude_folders=args.exclude
    )
    
    if success:
        print(f"\n✅ Success! Code extracted to '{args.output}'")
    else:
        print(f"\n❌ Extraction failed.")

if __name__ == "__main__":
    main()