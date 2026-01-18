// test-smsleopard-quick.ts
import dotenv from 'dotenv';
dotenv.config();

const testPhone = '254111423809';

async function test() {
  console.log('🚀 Testing SMSLeopard...\n');
  
  // Test with CURL first to verify credentials
  console.log('1. Testing credentials with curl...');
  console.log(`curl -X POST https://api.smsleopard.com/v1/sms/send \\
    -H "Authorization: Bearer ${process.env.SMSLEOPARD_ACCESS_TOKEN}" \\
    -H "Content-Type: application/json" \\
    -d '{
      "to": "${testPhone.replace('+', '')}",
      "message": "Test from curl"
    }'`);
    
  console.log('\n2. Testing from Node...');
  
  // Import the service after setting env vars
  const { sendSmsMessage } = await import('./src/services/smsService');
  
  try {
    const result = await sendSmsMessage(
      testPhone,
      'Test message from AgriPrice via SMSLeopard',
      { smsType: 'test' }
    );
    
    console.log('\n✅ Result:', {
      status: result.status,
      external_id: result.external_id,
      error: result.error_message
    });
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

test();