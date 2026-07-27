import os
import sys
import json
import base64
import time  # 🚀 Added to handle the 5-second reconnect delay
from google.cloud import pubsub_v1
from supabase import create_client
from dotenv import load_dotenv

# 🚀 THE FIX: Step up one folder from 'api' to 'app' so Python can see the 'services' folder
current_dir = os.path.dirname(os.path.abspath(__file__))
app_dir = os.path.dirname(current_dir)
if app_dir not in sys.path:
    sys.path.insert(0, app_dir)

from services.email.gmail_service import MultiTenantGmailService

# Load environment variables (Make sure .env is accessible!)
load_dotenv()

# Tell Google exactly where your Service Account key is located
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.join(BASE_DIR, "service_account.json")

# Configuration
PROJECT_ID = "hirexo-ats"
SUBSCRIPTION_NAME = "gmail-inbound-replies-sub2" 
TOPIC_NAME = "projects/hirexo-ats/topics/gmail-inbound-replies"

# Safely grab Supabase credentials whether they have the VITE_ prefix or not
supabase_url = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")

# Initialize Admin Supabase Client to find which company owns the incoming email
supabase = create_client(supabase_url, supabase_key)

# 🚀 DEDUPLICATION CACHE: Keep track of recently processed IDs to stop infinite loops
processed_message_ids = set()

def activate_watches():
    """Automatically tells Google to start watching all connected inboxes."""
    print("🔄 Checking for active email integrations to activate push notifications...")
    try:
        response = supabase.table("company_email_integrations").select("company_id").execute()
        if not response.data:
            print("⚠️ No active integrations found in the database.")
            return

        for integration in response.data:
            comp_id = integration['company_id']
            try:
                gmail_agent = MultiTenantGmailService(company_id=comp_id)
                request_body = {'labelIds': ['INBOX'], 'topicName': TOPIC_NAME}
                res = gmail_agent.service.users().watch(userId='me', body=request_body).execute()
                print(f"✅ Successfully activated watch for company {comp_id}. HistoryId: {res.get('historyId')}")
            except Exception as e:
                print(f"🚨 Failed to watch inbox for company {comp_id}: {e}")
    except Exception as e:
        print(f"🚨 Error querying Supabase for integrations: {e}")

def process_new_email_notification(message):
    """This function triggers the exact millisecond Gmail gets a new email."""
    try:
        # 1. 🚀 THE NEW ROBUST DECODER 🚀
        data_str = message.data.decode('utf-8') if isinstance(message.data, bytes) else message.data
        
        if data_str.strip().startswith('{'):
            payload = json.loads(data_str)
        else:
            padded_data = data_str + '=' * (4 - len(data_str) % 4)
            payload = json.loads(base64.urlsafe_b64decode(padded_data).decode('utf-8'))
            
        target_email_address = payload.get('emailAddress')
        # Use the message ID provided by Pub/Sub to identify uniqueness
        pubsub_message_id = message.message_id 

        # 🚀 DEDUPLICATION CHECK: Stop the echo loop
        if pubsub_message_id in processed_message_ids:
            print(f"⚠️ Duplicate message {pubsub_message_id} ignored.")
            message.ack()
            return
        
        processed_message_ids.add(pubsub_message_id)
        # Keep the memory set small (clear old IDs)
        if len(processed_message_ids) > 1000:
            processed_message_ids.clear()
        
        print(f"\n⚡ INSTANT PING RECEIVED for Inbox: {target_email_address}")
        
        # 2. Look up which company/tenant owns this Gmail address
        comp_res = supabase.table("company_email_integrations").select("company_id").eq("email_address", target_email_address).execute()
        
        if comp_res.data:
            company_id = comp_res.data[0]['company_id']
            print(f"🏢 Matched to Company ID: {company_id}. Initiating sync...")
            
            # 3. Fire up the Gmail Engine and pull the reply!
            gmail_agent = MultiTenantGmailService(company_id=company_id)
            gmail_agent.sync_inbound_replies()
        else:
            print(f"⚠️ Email address {target_email_address} not found in active ATS integrations.")
        
        # 4. Acknowledge the message so Google knows we handled it
        message.ack()
        
    except Exception as e:
        print(f"❌ Failed to process push notification: {str(e)}")
        message.ack() 

def start_listening():
    """Starts the long-running Pub/Sub listener with auto-reconnect."""
    activate_watches()
    
    subscriber = pubsub_v1.SubscriberClient()
    subscription_path = subscriber.subscription_path(PROJECT_ID, SUBSCRIPTION_NAME)

    while True:
        print(f"\n🎧 Listening for incoming Gmail replies on {subscription_path}...\n")
        
        streaming_pull_future = subscriber.subscribe(subscription_path, callback=process_new_email_notification)
        
        try:
            streaming_pull_future.result() 
        except KeyboardInterrupt:
            streaming_pull_future.cancel()
            print("\n🛑 Listener stopped safely by user.")
            break 
        except Exception as network_error:
            print(f"\n⚠️ Network stream disconnected: {network_error}")
            streaming_pull_future.cancel()
            print("🔄 Reconnecting to Google Pub/Sub in 5 seconds...")
            time.sleep(5)

if __name__ == "__main__":
    start_listening()