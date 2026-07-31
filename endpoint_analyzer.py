#!/usr/bin/env python3
"""
endpoint_analyzer.py - API Endpoint Health Checker
Analyzes frontend and backend code to find missing or unused API endpoints.
Run this script during development to catch API mismatches early.
"""

import os
import re
import sys
import json
from pathlib import Path
from datetime import datetime
from collections import defaultdict
from typing import Dict, Set, List, Tuple

class EndpointAnalyzer:
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.frontend_endpoints = defaultdict(set)
        self.backend_endpoints = defaultdict(set)
        self.matched = set()
        self.missing = set()
        self.extra = set()
        
        # Routes to ignore (website routes, static files, etc.)
        self.ignore_routes = {
            # Website HTML routes
            '/access-denied', '/admin', '/admin/accounting', '/browse', '/connect', 
            '/consignment', '/dashboard', '/gift-cards', '/inventory', '/kiosk', 
            '/login', '/misc', '/misch', '/payment-confirm', '/youtube-linker',
            # Static file routes
            '/css/', '/fonts/', '/images/', '/js/', '/static/',
            # Root route
            '/',
        }
        
        # API routes that don't use /api/ prefix
        self.api_routes_without_prefix = [
            '/accessories',
            '/artists',
            '/barcodes',
            '/catalog',
            '/commission-rate',
            '/config',
            '/consignment',
            '/health',
            '/logout',
            '/merchandise',
            '/print-receipt',
            '/print-test',
            '/printers',
            '/records',
            '/session',
            '/stats',
            '/statuses',
            '/test-square',
            '/users',
        ]
        
        # Colors for terminal output
        self.GREEN = '\033[92m'
        self.RED = '\033[91m'
        self.YELLOW = '\033[93m'
        self.BLUE = '\033[94m'
        self.MAGENTA = '\033[95m'
        self.CYAN = '\033[96m'
        self.WHITE = '\033[97m'
        self.RESET = '\033[0m'
        self.BOLD = '\033[1m'
    
    def should_ignore_route(self, route: str, file_path: Path = None) -> bool:
        """Check if a route should be ignored (not an API endpoint)"""
        if not route:
            return True
        
        # If it's from website_routes.py, ignore it (these are HTML pages, not APIs)
        if file_path and 'website_routes.py' in str(file_path):
            return True
        
        # Check exact matches
        if route in self.ignore_routes:
            return True
        
        # Check if it's a static file route
        if route.startswith('/css/') or route.startswith('/fonts/') or \
           route.startswith('/images/') or route.startswith('/js/') or \
           route.startswith('/static/') or route.startswith('/favicon'):
            return True
        
        # Check if it's a file extension route
        if route.endswith('.js') or route.endswith('.css') or \
           route.endswith('.png') or route.endswith('.jpg') or \
           route.endswith('.svg') or route.endswith('.ico'):
            return True
        
        # If it's in the API routes list, don't ignore it
        for route_prefix in self.api_routes_without_prefix:
            if route.startswith(route_prefix):
                return False
        
        # If it doesn't start with /api/ and isn't in the API routes list, it's likely a website route
        if not route.startswith('/api/') and not route.startswith('/v1/') and not route.startswith('/v2/'):
            return True
        
        return False
    
    def is_api_endpoint(self, endpoint: str) -> bool:
        """Check if a string is an API endpoint"""
        if not endpoint:
            return False
        
        # Check for standard API prefix
        if endpoint.startswith('/api/') or endpoint.startswith('/v1/') or endpoint.startswith('/v2/'):
            return True
        
        # API routes that don't use /api/ prefix
        for route in self.api_routes_without_prefix:
            if endpoint.startswith(route):
                return True
        
        return False
    
    def scan_frontend(self):
        """Scan all frontend files for API endpoint calls"""
        print(f"{self.CYAN}🔍 Scanning frontend files...{self.RESET}")
        
        # Comprehensive patterns to detect API calls - including template literals
        patterns = [
            # fetch with quoted strings
            r'fetch\s*\(\s*["\']([^"\']+)["\']',
            # fetch with template literals
            r'fetch\s*\(\s*`([^`]+)`',
            # fetch with AppConfig.baseUrl template literal
            r'fetch\s*\(\s*`\$\{AppConfig\.baseUrl\}([^`]+)`',
            # fetch with AppConfig.baseUrl concatenation
            r'fetch\s*\(\s*AppConfig\.baseUrl\s*\+\s*["\']([^"\']+)["\']',
            r'fetch\s*\(\s*AppConfig\.baseUrl\s*\+\s*`([^`]+)`',
            
            # axios with quoted strings
            r'axios\.(get|post|put|delete|patch)\s*\(\s*["\']([^"\']+)["\']',
            # axios with template literals
            r'axios\.(get|post|put|delete|patch)\s*\(\s*`([^`]+)`',
            
            # $.ajax calls
            r'\$\.ajax\s*\(\s*\{[\s\S]*?url\s*:\s*["\']([^"\']+)["\']',
            r'\$\.ajax\s*\(\s*\{[\s\S]*?url\s*:\s*`([^`]+)`',
            
            # api object calls
            r'api\.(get|post|put|delete|patch)\s*\(\s*["\']([^"\']+)["\']',
            r'api\.(get|post|put|delete|patch)\s*\(\s*`([^`]+)`',
            
            # raw /api/ paths in strings
            r'["\'](/api/[^"\'\s]+)["\']',
            
            # template literals with API paths
            r'`\s*/api/[^`]+`',
            
            # AppConfig.baseUrl + path (various forms)
            r'AppConfig\.baseUrl\s*\+\s*["\']([^"\']+)["\']',
            r'AppConfig\.baseUrl\s*\+\s*`([^`]+)`',
            
            # baseUrl + path
            r'baseUrl\s*\+\s*["\']([^"\']+)["\']',
            r'baseUrl\s*\+\s*`([^`]+)`',
            
            # XMLHttpRequest
            r'xhr\.open\s*\(\s*["\'][^"\']+["\']\s*,\s*["\']([^"\']+)["\']',
            
            # route definitions in JS
            r'route\s*:\s*["\']([^"\']+)["\']',
            r'route\s*:\s*`([^`]+)`',
            
            # url: in objects
            r'url\s*:\s*["\']([^"\']+)["\']',
            r'url\s*:\s*`([^`]+)`',
            
            # API calls with variables in path (template literal style)
            r'fetch\s*\(\s*["\']([^"\']*)\$\{[^}]+\}([^"\']*)["\']',
            r'fetch\s*\(\s*`([^`]*)\$\{[^}]+\}([^`]*)`',
            r'axios\.(get|post|put|delete|patch)\s*\(\s*`([^`]*)\$\{[^}]+\}([^`]*)`',
            
            # URL variable then fetch (any variable name ending with Url)
            r'\b\w+Url\s*=\s*["\']([^"\']+)["\']\s*;?\s*.*?fetch\s*\(\s*\w+Url',
            r'\b\w+Url\s*=\s*`([^`]+)`\s*;?\s*.*?fetch\s*\(\s*\w+Url',
            r'\b\w+Url\s*=\s*AppConfig\.baseUrl\s*\+\s*["\']([^"\']+)["\']\s*;?\s*.*?fetch\s*\(\s*\w+Url',
            r'\b\w+Url\s*=\s*AppConfig\.baseUrl\s*\+\s*`([^`]+)`\s*;?\s*.*?fetch\s*\(\s*\w+Url',
            r'\b\w+Url\s*=\s*`\$\{AppConfig\.baseUrl\}([^`]+)`\s*;?\s*.*?fetch\s*\(\s*\w+Url',
        ]
        
        # SCAN EVERYTHING - recursively find ALL .js and .html files
        all_files = []
        
        # Walk through the entire project directory
        for root, dirs, files in os.walk(self.project_root):
            # Skip certain directories
            skip_dirs = {'node_modules', 'venv', 'env', '.git', '__pycache__', 'dist', 'build', '.vscode'}
            dirs[:] = [d for d in dirs if d not in skip_dirs]
            
            for file in files:
                if file.endswith(('.js', '.html', '.vue', '.ts', '.tsx', '.jsx')):
                    file_path = Path(root) / file
                    all_files.append(file_path)
        
        print(f"  📁 Found {len(all_files)} files to scan")
        
        found_js_files = 0
        
        for file_path in all_files:
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    if file_path.suffix in ['.js', '.ts', '.jsx', '.tsx']:
                        found_js_files += 1
                    
                    # Try each pattern
                    for pattern in patterns:
                        matches = re.findall(pattern, content, re.IGNORECASE)
                        for match in matches:
                            if isinstance(match, tuple):
                                # Get the URL part
                                url_part = None
                                for part in match:
                                    if part and isinstance(part, str) and ('/api/' in part or part.startswith('/')):
                                        url_part = part
                                        break
                                if not url_part:
                                    url_part = match[-1] if match else None
                            else:
                                url_part = match
                            
                            if not url_part:
                                continue
                            
                            # Clean and normalize the endpoint
                            cleaned = self.clean_endpoint(url_part)
                            if cleaned and self.is_api_endpoint(cleaned):
                                relative_path = file_path.relative_to(self.project_root)
                                self.frontend_endpoints[cleaned].add(str(relative_path))
            except Exception as e:
                pass
        
        # Print summary
        print(f"  ✅ Scanned {len(all_files)} frontend files ({found_js_files} JavaScript files)")
        print(f"  📊 Found {len(self.frontend_endpoints)} unique frontend API endpoints")
    
    def scan_backend(self):
        """Scan backend API files for route definitions"""
        print(f"{self.CYAN}🔍 Scanning backend files...{self.RESET}")
        
        # Patterns to detect route definitions - more comprehensive
        patterns = [
            # Flask route decorators
            r'@app\.route\s*\(\s*["\']([^"\']+)["\']',
            r'@app\.(get|post|put|delete|patch)\s*\(\s*["\']([^"\']+)["\']',
            r'@bp\.route\s*\(\s*["\']([^"\']+)["\']',
            r'@bp\.(get|post|put|delete|patch)\s*\(\s*["\']([^"\']+)["\']',
            r'@api\.route\s*\(\s*["\']([^"\']+)["\']',
            r'@api\.(get|post|put|delete|patch)\s*\(\s*["\']([^"\']+)["\']',
            # FastAPI patterns
            r'@app\.(get|post|put|delete|patch)\s*\(\s*["\']([^"\']+)["\']',
            r'@router\.(get|post|put|delete|patch)\s*\(\s*["\']([^"\']+)["\']',
            # Django patterns
            r'path\s*\(\s*["\']([^"\']+)["\']',
            r're_path\s*\(\s*["\']([^"\']+)["\']',
            r'url\s*\(\s*["\']([^"\']+)["\']',
            # Generic route patterns
            r'route\s*\(\s*["\']([^"\']+)["\']',
            r'add_url_rule\s*\(\s*["\']([^"\']+)["\']',
            r'@.*?\.route\s*\(\s*["\']([^"\']+)["\']',
            # REST framework patterns
            r'@action\s*\(\s*["\']([^"\']+)["\']',
            r'@list_route\s*\(\s*["\']([^"\']+)["\']',
            r'@detail_route\s*\(\s*["\']([^"\']+)["\']',
            # Route with variable patterns
            r'@app\.route\s*\(\s*["\']([^"\']*<[^>]+>[^"\']*)["\']',
        ]
        
        # Backend files to scan - more comprehensive
        backend_files = []
        backend_dirs = [
            self.project_root / 'backend',
            self.project_root / 'app',
            self.project_root / 'src',
            self.project_root,
        ]
        
        for dir_path in backend_dirs:
            if not dir_path.exists():
                continue
            for file_path in dir_path.rglob('*.py'):
                # Skip __pycache__, venv, etc.
                if any(part in file_path.parts for part in ['__pycache__', 'venv', '.git', 'env']):
                    continue
                # Only include files that might have routes
                if 'api' in file_path.name or 'route' in file_path.name or 'app' in file_path.name:
                    backend_files.append(file_path)
        
        found_files = 0
        ignored_count = 0
        
        for file_path in backend_files:
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    found_files += 1
                    
                    for pattern in patterns:
                        matches = re.findall(pattern, content)
                        for match in matches:
                            if isinstance(match, tuple):
                                # Get the route path (usually the last element or second element)
                                if len(match) >= 2 and match[1].startswith('/'):
                                    endpoint = match[1]
                                elif len(match) >= 1:
                                    endpoint = match[0] if match[0].startswith('/') else match[-1]
                                else:
                                    continue
                            else:
                                endpoint = match
                            
                            # Clean and normalize the endpoint
                            cleaned = self.clean_endpoint(endpoint)
                            if cleaned:
                                # Check if we should ignore this route
                                if self.should_ignore_route(cleaned, file_path):
                                    ignored_count += 1
                                    continue
                                
                                relative_path = file_path.relative_to(self.project_root)
                                self.backend_endpoints[cleaned].add(str(relative_path))
            except Exception as e:
                # Silent fail for individual files
                pass
        
        print(f"  ✅ Scanned {found_files} backend files")
        print(f"  📊 Found {len(self.backend_endpoints)} unique backend API endpoints (ignored {ignored_count} website/static routes)")
    
    def clean_endpoint(self, endpoint: str) -> str:
        """Clean and normalize an endpoint URL"""
        if not endpoint:
            return None
        
        # Remove quotes and backticks
        endpoint = endpoint.replace('"', '').replace("'", '').replace('`', '')
        
        # Remove query parameters (but keep the path)
        if '?' in endpoint:
            endpoint = endpoint.split('?')[0]
        if '#' in endpoint:
            endpoint = endpoint.split('#')[0]
        
        # Remove trailing slash
        endpoint = endpoint.rstrip('/')
        
        # Handle template literals with variables
        if '${' in endpoint:
            parts = endpoint.split('${')
            endpoint = parts[0]
            if not endpoint.endswith('/') and len(parts) > 1:
                endpoint += '*'
        
        # Handle Flask-style variables <int:id>
        endpoint = re.sub(r'<[^>]+>', '*', endpoint)
        
        # Ensure leading slash
        if endpoint and not endpoint.startswith('/') and '/' in endpoint:
            endpoint = '/' + endpoint
        
        # Remove duplicate slashes
        if endpoint:
            endpoint = re.sub(r'\/\/+', '/', endpoint)
        
        return endpoint if endpoint else None
    
    def is_api_endpoint(self, endpoint: str) -> bool:
        """Check if a string is an API endpoint"""
        if not endpoint:
            return False
        
        # Check for standard API prefix
        if endpoint.startswith('/api/') or endpoint.startswith('/v1/') or endpoint.startswith('/v2/'):
            return True
        
        # API routes that don't use /api/ prefix
        for route in self.api_routes_without_prefix:
            if endpoint.startswith(route):
                return True
        
        return False
    
    def compare_endpoints(self):
        """Compare frontend and backend endpoints with better matching"""
        print(f"{self.CYAN}🔍 Comparing endpoints...{self.RESET}")
        
        frontend_keys = set(self.frontend_endpoints.keys())
        backend_keys = set(self.backend_endpoints.keys())
        
        # Normalize keys for better matching
        def normalize_path(path):
            """Remove trailing slashes and normalize for comparison"""
            if not path:
                return path
            return path.rstrip('/')
        
        normalized_frontend = {normalize_path(k): k for k in frontend_keys}
        normalized_backend = {normalize_path(k): k for k in backend_keys}
        
        frontend_norm = set(normalized_frontend.keys())
        backend_norm = set(normalized_backend.keys())
        
        # Find exact matches
        matched_norm = frontend_norm & backend_norm
        self.matched = {normalized_frontend[k] for k in matched_norm}
        
        # Find missing (in frontend but not backend)
        missing_norm = frontend_norm - backend_norm
        self.missing = {normalized_frontend[k] for k in missing_norm}
        
        # Find extra (in backend but not frontend)
        extra_norm = backend_norm - frontend_norm
        self.extra = {normalized_backend[k] for k in extra_norm}
        
        # Check for wildcard matches - FRONTEND missing vs BACKEND wildcards
        missing_copy = list(self.missing)
        for key in missing_copy:
            for backend_key in backend_keys:
                if '*' in backend_key and self.match_pattern(backend_key, key):
                    self.matched.add(key)
                    self.missing.discard(key)
                    print(f"  ✓ Matched {key} → {backend_key} (wildcard match)")
                    break
        
        # Check for wildcard matches - BACKEND extra vs FRONTEND wildcards
        extra_copy = list(self.extra)
        for key in extra_copy:
            for frontend_key in frontend_keys:
                if '*' in frontend_key and self.match_pattern(frontend_key, key):
                    self.extra.discard(key)
                    print(f"  ✓ Matched {key} → {frontend_key} (wildcard match)")
                    break
        
        # Check for partial matches where frontend has trailing slash and backend has wildcard
        missing_copy = list(self.missing)
        for key in missing_copy:
            # If frontend key ends with / and backend has matching wildcard without /
            if key.endswith('/'):
                key_without_slash = key.rstrip('/')
                for backend_key in backend_keys:
                    if '*' in backend_key:
                        # Check if the backend wildcard matches the frontend key without trailing slash
                        backend_pattern = backend_key.replace('*', '')
                        if key_without_slash.startswith(backend_pattern) or key.startswith(backend_pattern):
                            self.matched.add(key)
                            self.missing.discard(key)
                            print(f"  ✓ Matched {key} → {backend_key} (trailing slash match)")
                            break
            
            # If backend has wildcard and frontend key starts with the static part
            for backend_key in backend_keys:
                if '*' in backend_key:
                    static_part = backend_key.split('*')[0]
                    if key.startswith(static_part) and key != static_part:
                        self.matched.add(key)
                        self.missing.discard(key)
                        print(f"  ✓ Matched {key} → {backend_key} (wildcard prefix match)")
                        break
        
        # Also check if /api/prefix matches without /api/
        missing_copy = list(self.missing)
        for key in missing_copy:
            # Try removing /api/ prefix
            without_api = key.replace('/api/', '/')
            if without_api in backend_keys:
                self.matched.add(key)
                self.missing.discard(key)
                print(f"  ✓ Matched {key} → {without_api} (without /api/ prefix)")
                continue
            
            # Try adding /api/ prefix for backend extra endpoints
            extra_copy = list(self.extra)
            for backend_key in extra_copy:
                if f'/api{backend_key}' == key or f'/api/{backend_key.lstrip("/")}' == key:
                    self.matched.add(key)
                    self.missing.discard(key)
                    self.extra.discard(backend_key)
                    print(f"  ✓ Matched {key} → {backend_key} (with /api/ prefix)")
                    break
        
        # FINAL CLEANUP: Remove any matched endpoints from missing/extra
        # This ensures endpoints matched by wildcards are completely removed
        self.missing = self.missing - self.matched
        self.extra = self.extra - self.matched
        
        # Additional cleanup for endpoints that should be matched via regex
        for frontend_key in list(self.missing):
            for backend_key in backend_keys:
                if '*' in backend_key:
                    pattern = backend_key.replace('*', '[^/]+')
                    if re.match(f'^{pattern}$', frontend_key):
                        self.matched.add(frontend_key)
                        self.missing.discard(frontend_key)
                        print(f"  ✓ Matched {frontend_key} → {backend_key} (regex wildcard match)")
                        break
    
    def match_pattern(self, pattern: str, endpoint: str) -> bool:
        """Match a wildcard pattern against an endpoint"""
        if not pattern or not endpoint:
            return False
        # Convert wildcard pattern to regex
        regex_pattern = pattern.replace('*', '[^/]+')
        regex_pattern = regex_pattern.replace('/', '\\/')
        return bool(re.search(f'^{regex_pattern}$', endpoint))
    
    def print_summary(self):
        """Print a summary of the analysis - only mismatches"""
        print(f"\n{self.BOLD}{self.CYAN}{'='*60}{self.RESET}")
        print(f"{self.BOLD}{self.CYAN}📊 API ENDPOINT ANALYSIS SUMMARY{self.RESET}")
        print(f"{self.BOLD}{self.CYAN}{'='*60}{self.RESET}\n")
        
        print(f"  {self.BOLD}Frontend endpoints:{self.RESET} {len(self.frontend_endpoints)}")
        print(f"  {self.BOLD}Backend endpoints:{self.RESET}  {len(self.backend_endpoints)}")
        print(f"  {self.BOLD}Matched:{self.RESET}           {len(self.matched)}")
        print(f"  {self.BOLD}{self.RED}Missing in backend:{self.RESET} {len(self.missing)}")
        print(f"  {self.BOLD}{self.YELLOW}Extra in backend:{self.RESET}  {len(self.extra)}")
        
        # Show missing endpoints
        if self.missing:
            print(f"\n{self.BOLD}{self.RED}❌ MISSING IN BACKEND (called from frontend but not defined):{self.RESET}")
            for endpoint in sorted(self.missing):
                files = ', '.join(sorted(self.frontend_endpoints[endpoint]))
                print(f"  • {self.RED}{endpoint}{self.RESET}")
                print(f"    → {self.WHITE}Used in:{self.RESET} {files[:80]}{'...' if len(files) > 80 else ''}")
        
        # Show extra endpoints
        if self.extra:
            print(f"\n{self.BOLD}{self.YELLOW}⚠️  EXTRA IN BACKEND (defined but not called from frontend):{self.RESET}")
            for endpoint in sorted(self.extra):
                files = ', '.join(sorted(self.backend_endpoints[endpoint]))
                print(f"  • {self.YELLOW}{endpoint}{self.RESET}")
                print(f"    → {self.WHITE}Defined in:{self.RESET} {files[:80]}{'...' if len(files) > 80 else ''}")
        
        # Overall status - NO matched endpoints listed
        print(f"\n{self.BOLD}{self.CYAN}{'='*60}{self.RESET}")
        if len(self.missing) == 0 and len(self.extra) == 0:
            print(f"{self.BOLD}{self.GREEN}✅ PERFECT! All endpoints are properly matched!{self.RESET}")
        else:
            print(f"{self.BOLD}{self.YELLOW}⚠️  Found {len(self.missing) + len(self.extra)} issues to fix{self.RESET}")
            if len(self.missing) > 0:
                print(f"  • {len(self.missing)} endpoints missing in backend")
            if len(self.extra) > 0:
                print(f"  • {len(self.extra)} endpoints extra in backend")
        print(f"{self.BOLD}{self.CYAN}{'='*60}{self.RESET}\n")
    
    def run(self):
        """Run the complete analysis"""
        print(f"\n{self.BOLD}{self.CYAN}🚀 Starting API Endpoint Analysis{self.RESET}")
        print(f"{self.BOLD}Project root:{self.RESET} {self.project_root}\n")
        
        self.scan_frontend()
        self.scan_backend()
        self.compare_endpoints()
        self.print_summary()
        
        # Return exit code (1 if issues found, 0 if perfect)
        if len(self.missing) > 0 or len(self.extra) > 0:
            return 1
        return 0


def main():
    """Main entry point"""
    # Get the project root (where this script is located)
    script_dir = Path(__file__).parent
    project_root = script_dir
    
    # Parse command line arguments
    import argparse
    parser = argparse.ArgumentParser(description='Analyze API endpoints in your codebase')
    parser.add_argument('--dir', '-d', type=str, default=str(project_root),
                        help='Project root directory (default: current directory)')
    parser.add_argument('--quiet', '-q', action='store_true',
                        help='Quiet mode - only show issues')
    args = parser.parse_args()
    
    # Run the analyzer
    analyzer = EndpointAnalyzer(args.dir)
    exit_code = analyzer.run()
    
    sys.exit(exit_code)


if __name__ == '__main__':
    main()