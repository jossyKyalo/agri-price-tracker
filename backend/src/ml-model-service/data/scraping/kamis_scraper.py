import requests
import pandas as pd
from bs4 import BeautifulSoup
import os
from io import StringIO

BASE_URL = "https://kamis.kilimo.go.ke/site/market"
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "../raw/kamis_data.csv")

PRODUCT_IDS = range(1, 274)  

all_data = []

for product_id in PRODUCT_IDS:
    url = f"{BASE_URL}?product={product_id}&per_page=3000"
    print(f"Fetching product {product_id}")

    try:
        response = requests.get(url, timeout=20)
        response.raise_for_status()
    except Exception as e:
        print(f"Failed to fetch product {product_id}: {e}")
        continue

    soup = BeautifulSoup(response.text, "html.parser")
 
    product_name = None
    title = soup.find("h3")
    if title:
        product_name = title.get_text(strip=True)

    table = soup.find("table")
    if not table:
        print(f"No table found for product {product_id} ({product_name})")
        continue

    try:
        df = pd.read_html(StringIO(str(table)))[0]
        df["ProductID"] = product_id
        df["ProductName"] = product_name if product_name else f"Product-{product_id}"
        all_data.append(df)
        print(f"Scraped {len(df)} rows for {product_name or 'Unknown'}")
    except Exception as e:
        print(f"Skipping product {product_id}, parsing error: {e}")
 
if all_data:
    final_df = pd.concat(all_data, ignore_index=True)
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    final_df.to_csv(OUTPUT_PATH, index=False)
    print(f"\nScraped {len(final_df)} total rows across {len(all_data)} products.")
    print(f"Saved to {OUTPUT_PATH}")
else:
    print("No data scraped.")
