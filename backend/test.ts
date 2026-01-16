// test-sms-flow.ts
import dotenv from 'dotenv';
dotenv.config();

import smsService from './src/services/smsService';

async function testCompleteSmsFlow() {
  console.log('🚀 Testing Complete SMS Flow');
  console.log('='.repeat(60));
  
  const testPhone = '254111423809'; // Your test number
  
  // 1. Test Textbelt Connection
  console.log('\n1. 🔌 Testing Textbelt Connection...');
  const connection = await smsService.testTextbeltConnection();
  console.log(`   Status: ${connection.isActive ? '✅ Active' : '❌ Inactive'}`);
  console.log(`   Details: ${connection.status}`);
  
  if (!connection.isActive) {
    console.log('❌ Cannot proceed - Textbelt connection failed');
    return;
  }
  
  // 2. Check Quota
  console.log('\n2. 💰 Checking SMS Quota...');
  const quota = await smsService.checkTextbeltQuota();
  console.log(`   Quota Remaining: ${quota.quotaRemaining}`);
  console.log(`   Has Quota: ${quota.hasQuota ? '✅ Yes' : '❌ No'}`);
  
  if (!quota.hasQuota) {
    console.log('⚠️  Low or no quota - test messages may fail');
  }
  
  // 3. Send Test SMS with Webhook
  console.log('\n3. 📤 Sending Test SMS with Webhook Support...');
  const testMessage = `AgriPrice Test Message\n\nReply with a location (e.g., NAIROBI) to get current crop prices.\n\nCommands:\n• Reply STOP to unsubscribe\n• Reply HELP for info`;
  
  const smsResult = await smsService.sendSmsMessage(testPhone, testMessage, {
    smsType: 'test',
    replyWebhookUrl: `${process.env.APP_BASE_URL}/api/v1/sms/webhook`,
    webhookData: 'test_user_123'
  });
  
  console.log(`   Status: ${smsResult.status === 'sent' ? '✅ Sent' : '❌ Failed'}`);
  console.log(`   Message ID: ${smsResult.external_id || 'N/A'}`);
  
  if (smsResult.status === 'sent') {
    console.log(`   ✅ SMS sent with webhook enabled`);
    console.log(`   📱 Please reply to the SMS from your phone to test`);
    console.log(`   🔗 Webhook URL: ${process.env.APP_BASE_URL}/api/v1/sms/webhook`);
  }
  
  // 4. Test SMS Reply System
  console.log('\n4. 🧪 Testing SMS Reply System...');
  const replyTest = await smsService.testReplySystem(testPhone);
  console.log(`   Success: ${replyTest.success ? '✅' : '❌'}`);
  console.log(`   Message: ${replyTest.message}`);
  
  // 5. Test Integration
  console.log('\n5. 🛠️  Testing Full Integration...');
  const integration = await smsService.testTextbeltIntegration(testPhone);
  console.log(`   Success: ${integration.success ? '✅' : '❌'}`);
  console.log(`   Message: ${integration.message}`);
  
  console.log('\n' + '='.repeat(60));
  console.log('🎉 Test Complete!');
  console.log('\n📝 Next Steps:');
  console.log('1. Check your phone for the test message');
  console.log('2. Reply to the message with a location (e.g., NAIROBI)');
  console.log('3. Check server logs for webhook processing');
  console.log('4. Try other commands: STOP, HELP, JOIN');
}

// Run the test
testCompleteSmsFlow().catch(console.error);