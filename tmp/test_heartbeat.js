async function testHeartbeat() {
    const agent_key = process.env.AGENT_KEY || '';
    const url = 'https://mlluhuiwtsjndkztomjx.supabase.co/functions/v1/webhook-agent';

    const payload = {
        event: 'heartbeat',
        status: 'online',
        version: '1.0.0',
        agent_key: agent_key
    };

    console.log('Sending heartbeat to:', url);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        console.log('Response status:', res.status);
        const json = await res.json();
        console.log('Response body:', JSON.stringify(json, null, 2));
    } catch (err) {
        console.error('Error:', err);
    }
}

testHeartbeat();
