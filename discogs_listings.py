#!/usr/bin/env python3
"""
Pull Discogs Listings - Correct API Endpoint
"""

import requests
import json

TOKEN = "HylxGPoAuRgKwLfzbybZRyTxvxqXbrYJUhsZAkZq"

headers = {
    'Authorization': f'Discogs token={TOKEN}',
    'User-Agent': 'PigStyleMusic/1.0'
}

print("Fetching your Discogs inventory...")
print()

# Use the inventory endpoint correctly
all_listings = []
page = 1

while True:
    response = requests.get(
        f'https://api.discogs.com/users/pigstyle/inventory',
        headers=headers,
        params={'page': page, 'per_page': 100}
    )
    
    if response.status_code != 200:
        print(f"Error: {response.status_code}")
        print(response.text)
        break
    
    data = response.json()
    listings = data.get('listings', [])
    
    if not listings:
        break
    
    all_listings.extend(listings)
    print(f"Page {page}: {len(listings)} listings")
    
    if page >= data.get('pagination', {}).get('pages', 1):
        break
    
    page += 1

print(f"\nTotal listings found: {len(all_listings)}")
print()

# Display your listings
if all_listings:
    for i, listing in enumerate(all_listings, 1):
        title = listing.get('release', {}).get('title', 'Unknown')
        release_id = listing.get('release_id')
        listing_id = listing.get('id')
        price = listing.get('price', {}).get('value', 0)
        status = listing.get('status', 'Unknown')
        
        print(f"{i}. {title}")
        print(f"   Listing ID: {listing_id}")
        print(f"   Release ID: {release_id}")
        print(f"   Price: ${price}")
        print(f"   Status: {status}")
        print()
else:
    print("No listings found")

# Save to file
with open('my_discogs_listings.json', 'w') as f:
    json.dump(all_listings, f, indent=2)

print(f"Saved to my_discogs_listings.json")