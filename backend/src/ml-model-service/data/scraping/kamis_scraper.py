import requests
import pandas as pd
from bs4 import BeautifulSoup
import os
from io import StringIO
import time
import random
from datetime import datetime, timedelta
 
BASE_URL = "https://kamis.kilimo.go.ke/site/market"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "../../data/raw")
 
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "kamis_data.csv")
 
PER_PAGE = 10000 

 
LAST_SCRAPE_DATE_STR = "2025-09-17"
CUTOFF_DATE = datetime.strptime(LAST_SCRAPE_DATE_STR, "%Y-%m-%d")

PRODUCT_IDS = range(1, 274) 

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Referer": "https://kamis.kilimo.go.ke/"
}

def scrape_market_data():
    new_data = []
    
    print(f"🚀 Starting scrape for {len(PRODUCT_IDS)} products...")
    print(f"📅 Fetching online data posted after: {CUTOFF_DATE.strftime('%Y-%m-%d')}")
    print(f"📂 Master file target: {OUTPUT_FILE}")

    for product_id in PRODUCT_IDS:
        url = f"{BASE_URL}?product={product_id}&per_page={PER_PAGE}"
        
        try:
            time.sleep(random.uniform(0.5, 1.5))
            
            response = requests.get(url, headers=HEADERS, timeout=30)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, "html.parser")
            
            product_name = None
            title_tag = soup.find("h3")
            if title_tag:
                product_name = title_tag.get_text(strip=True).replace("Market Prices for ", "")

            table = soup.find("table")
            if not table:
                print(f".", end="", flush=True)
                continue

            df = pd.read_html(StringIO(str(table)))[0]
         
            df.columns = [c.strip() for c in df.columns]
             
            date_col = next((col for col in df.columns if 'date' in col.lower()), None)
            
            if date_col: 
                df[date_col] = pd.to_datetime(df[date_col], errors='coerce', dayfirst=True)
                 
                df = df[df[date_col] >= CUTOFF_DATE]
                
                if not df.empty:
                    df["ProductID"] = product_id
                    df["CropName"] = product_name if product_name else f"Unknown-{product_id}" 
                    df["ScrapedDate"] = datetime.now().strftime("%Y-%m-%d")
                    
                    new_data.append(df)
                    print(f"✅ {product_name}: found {len(df)} new rows")
            else: 
                print(f"⚠️  {product_name}: No date column found, keeping all {len(df)} rows.")
                df["ProductID"] = product_id
                df["CropName"] = product_name if product_name else f"Unknown-{product_id}"
                df["ScrapedDate"] = datetime.now().strftime("%Y-%m-%d")
                new_data.append(df)

        except Exception as e:
            print(f"\n❌ Error on Product {product_id}: {e}")
            continue

    print("\n\n🔄 Processing and Merging Data...")

    if new_data:
        new_df = pd.concat(new_data, ignore_index=True)
        print(f"   New data fetched: {len(new_df)} rows.")
 
        if os.path.exists(OUTPUT_FILE):
            print(f"   Existing master file found at {OUTPUT_FILE}. Loading...")
            try:
                existing_df = pd.read_csv(OUTPUT_FILE)
                
                combined_df = pd.concat([existing_df, new_df], ignore_index=True)
                 
                cols_to_check = [c for c in combined_df.columns if c != 'ScrapedDate']
                
                initial_len = len(combined_df)
                combined_df.drop_duplicates(subset=cols_to_check, keep='last', inplace=True)
                removed_count = initial_len - len(combined_df)
                
                print(f"   Merged and removed {removed_count} duplicate rows.")
                final_df = combined_df
                
            except Exception as e:
                print(f"⚠️ Error reading existing file ({e}). Creating a new master file.")
                final_df = new_df
        else:
            print("   No existing master file. Creating new one.")
            final_df = new_df
 
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        final_df.to_csv(OUTPUT_FILE, index=False)
        
        print("------------------------------------------------")
        print(f"🎉 Success! Master file updated.")
        print(f"📊 Total Rows in Master File: {len(final_df)}")
        print(f"💾 Saved to: {OUTPUT_FILE}")
        print("------------------------------------------------")
    else:
        print(f"⚠️  No new data found online after {LAST_SCRAPE_DATE_STR}.")

if __name__ == "__main__":
    scrape_market_data()