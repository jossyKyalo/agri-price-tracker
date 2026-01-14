import requests
import pandas as pd
from bs4 import BeautifulSoup
import os
from io import StringIO
import time
import random
from datetime import datetime, timedelta
import sys
import warnings
import io
 
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
 
warnings.filterwarnings("ignore", message="Parsing dates in %Y-%m-%d format")

 
BASE_URL = "https://kamis.kilimo.go.ke/site/market" 
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__)) 
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "../../data/raw")
MASTER_FILE = os.path.join(OUTPUT_DIR, "kamis_data.csv")
LATEST_FILE = os.path.join(OUTPUT_DIR, "kamis_latest.csv")

PER_PAGE = 10000 
 
days_back = 30
CUTOFF_DATE = datetime.now() - timedelta(days=days_back) 

PRODUCT_IDS = range(1, 274) 

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Referer": "https://kamis.kilimo.go.ke/"
}

def scrape_market_data():
    new_data = []
     
    print(f"[INFO] Starting scrape for {len(PRODUCT_IDS)} products...")
    print(f"[INFO] Fetching data from: {CUTOFF_DATE.strftime('%Y-%m-%d')} to TODAY")
     
    try:
        requests.get(BASE_URL, headers=HEADERS, timeout=10)
    except requests.exceptions.ConnectionError:
        print("\n[ERROR] CRITICAL: KAMIS site unreachable.")
        os.makedirs(OUTPUT_DIR, exist_ok=True) 
        with open(LATEST_FILE, 'w') as f:
            f.write("Commodity,Classification,Grade,Sex,Market,Wholesale,Retail,Supply Volume,County,Date\n")
        sys.exit(0)
 
    for product_id in PRODUCT_IDS:
        url = f"{BASE_URL}?product={product_id}&per_page={PER_PAGE}"
        
        try:
            time.sleep(random.uniform(0.5, 1.0)) 
            response = requests.get(url, headers=HEADERS, timeout=30)
            if response.status_code >= 500: continue
            
            soup = BeautifulSoup(response.text, "html.parser")
            
            title_tag = soup.find("h3")
            product_name = title_tag.get_text(strip=True).replace("Market Prices for ", "") if title_tag else f"Product-{product_id}"
            
            table = soup.find("table")
            if not table:
                print(".", end="", flush=True)
                continue

            df = pd.read_html(StringIO(str(table)))[0]
            df.columns = [c.strip() for c in df.columns]
            
            date_col = next((col for col in df.columns if 'date' in col.lower()), None)
            
            if date_col: 
                df[date_col] = pd.to_datetime(df[date_col], errors='coerce', dayfirst=True) 
                df = df[df[date_col] >= CUTOFF_DATE]
                
                if not df.empty:
                    df["ProductID"] = product_id
                    df["CropName"] = product_name 
                    df[date_col] = df[date_col].dt.strftime('%Y-%m-%d')
                    new_data.append(df)
                    print(f"[OK] {product_name}: {len(df)} rows")
            
        except Exception as e:
            continue

    print("\n\n[INFO] Saving Data...")
 
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    if new_data:
        new_df = pd.concat(new_data, ignore_index=True) 
        new_df.to_csv(LATEST_FILE, index=False)
        print(f"[SUCCESS] Scraped {len(new_df)} rows to {LATEST_FILE}")
    else:
        print("[WARN] No new data found in range.") 
        with open(LATEST_FILE, 'w') as f:
             f.write("Commodity,Classification,Grade,Sex,Market,Wholesale,Retail,Supply Volume,County,Date\n")

if __name__ == "__main__":
    scrape_market_data()