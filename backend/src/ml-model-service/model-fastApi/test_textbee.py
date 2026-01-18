import requests

BASE_URL = "https://api.textbee.dev/api/v1"
API_KEY = "25222a9f-7194-4726-810b-0abafa718e83"
DEVICE_ID = "696d13b1e74f1bec8b4bf5c5"

response = requests.post(
    f"{BASE_URL}/gateway/devices/{DEVICE_ID}/send-sms",
    json={
        "recipients": ["+254790178387"],
        "message": "Welcome to Agri-Price Tracker! Your registration is successful."
    },
    headers={
        "x-api-key": API_KEY,
        "Content-Type": "application/json"
    },
    timeout=30
)

print("Status Code:", response.status_code)
print("Response:", response.json())
