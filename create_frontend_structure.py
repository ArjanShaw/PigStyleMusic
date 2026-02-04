import os
from pathlib import Path

def create_website_structure(base_path="/home/arjan-ubuntu/Documents/PigStyleMusic"):
    """Create the complete website folder structure with empty files."""
    
    # Define the directory paths
    project_root = Path(base_path)
    website_dir = project_root / "website"
    static_dir = website_dir / "static"
    templates_dir = website_dir / "templates"
    
    # Subdirectories for static files
    css_dir = static_dir / "css"
    js_dir = static_dir / "js"
    images_dir = static_dir / "images"
    fonts_dir = static_dir / "fonts"
    uploads_dir = static_dir / "uploads"
    
    # Create all directories
    directories = [
        website_dir,
        static_dir,
        css_dir,
        js_dir,
        images_dir,
        fonts_dir,
        uploads_dir,
        templates_dir
    ]
    
    print("📁 Creating website directory structure...")
    for directory in directories:
        directory.mkdir(parents=True, exist_ok=True)
        print(f"  ✅ Created: {directory.relative_to(project_root)}/")
    
    # Create empty HTML files in templates
    print("\n📄 Creating empty template files...")
    html_files = [
        templates_dir / "index.html",
        templates_dir / "base.html",
        templates_dir / "about.html",
        templates_dir / "contact.html",
        templates_dir / "catalog.html",
        templates_dir / "consignment.html",
        templates_dir / "records.html",
        templates_dir / "record_detail.html",
        templates_dir / "user_dashboard.html",
        templates_dir / "login.html",
        templates_dir / "register.html",
        templates_dir / "admin.html",
        templates_dir / "checkout.html",
        templates_dir / "spotify.html",
        templates_dir / "404.html",
        templates_dir / "500.html"
    ]
    
    for html_file in html_files:
        html_file.touch(exist_ok=True)
        print(f"  ✅ Created: {html_file.relative_to(project_root)}")
    
    # Create empty CSS files
    print("\n🎨 Creating empty CSS files...")
    css_files = [
        css_dir / "style.css",
        css_dir / "responsive.css",
        css_dir / "theme.css",
        css_dir / "animations.css",
        css_dir / "print.css"
    ]
    
    for css_file in css_files:
        css_file.touch(exist_ok=True)
        print(f"  ✅ Created: {css_file.relative_to(project_root)}")
    
    # Create empty JavaScript files
    print("\n⚡ Creating empty JavaScript files...")
    js_files = [
        js_dir / "main.js",
        js_dir / "api.js",
        js_dir / "catalog.js",
        js_dir / "checkout.js",
        js_dir / "spotify.js",
        js_dir / "auth.js",
        js_dir / "admin.js",
        js_dir / "forms.js",
        js_dir / "utils.js",
        js_dir / "vendor" / "jquery.min.js",  # Vendor directory
        js_dir / "vendor" / "bootstrap.min.js"
    ]
    
    for js_file in js_files:
        js_file.parent.mkdir(parents=True, exist_ok=True)
        js_file.touch(exist_ok=True)
        print(f"  ✅ Created: {js_file.relative_to(project_root)}")
    
    # Create empty image placeholders
    print("\n🖼️ Creating placeholder directories...")
    image_files = [
        images_dir / "logo.png",
        images_dir / "favicon.ico",
        images_dir / "hero-bg.jpg",
        images_dir / "default-record.jpg",
        images_dir / "icons" / "menu.svg",  # Subdirectory for icons
        images_dir / "icons" / "search.svg",
        images_dir / "icons" / "cart.svg",
        images_dir / "icons" / "user.svg"
    ]
    
    for img_file in image_files:
        img_file.parent.mkdir(parents=True, exist_ok=True)
        img_file.touch(exist_ok=True)
        print(f"  ✅ Created: {img_file.relative_to(project_root)}")
    
    # Create empty configuration files
    print("\n⚙️ Creating configuration files...")
    config_files = [
        website_dir / "config.json",
        website_dir / "README.md",
        static_dir / "robots.txt",
        static_dir / "sitemap.xml",
        static_dir / ".htaccess"
    ]
    
    for config_file in config_files:
        config_file.touch(exist_ok=True)
        print(f"  ✅ Created: {config_file.relative_to(project_root)}")
    
    # Create Flask routes file
    routes_file = website_dir / "website_routes.py"
    routes_file.touch(exist_ok=True)
    print(f"  ✅ Created: {routes_file.relative_to(project_root)}")
    
    print("\n🎉 Website structure created successfully!")
    
    # Print the structure
    print("\n📋 Generated Structure:")
    print_structure(website_dir)
    
    print("\n📦 Next steps:")
    print("1. Copy your existing HTML/CSS/JS files to the appropriate directories")
    print("2. Run the Flask integration script:")
    print(f"   python3 {website_dir / 'website_routes.py'}")
    print("3. Test your website at: http://localhost:5000")

def print_structure(base_dir, prefix="", max_depth=4):
    """Print the directory structure."""
    base_path = Path(base_dir)
    items = sorted(base_path.iterdir())
    
    for i, item in enumerate(items):
        is_last = (i == len(items) - 1)
        depth = len(str(item.relative_to(base_path.parent)).split('/')) - 1
        
        if depth > max_depth:
            continue
            
        connector = "└── " if is_last else "├── "
        print(f"{prefix}{connector}{item.name}{'/' if item.is_dir() else ''}")
        
        if item.is_dir():
            next_prefix = prefix + ("    " if is_last else "│   ")
            print_structure(item, next_prefix, max_depth)

if __name__ == "__main__":
    # You can change this path if needed
    create_website_structure()