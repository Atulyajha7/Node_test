const net = require('net');
const fs = require('fs');

const SERVER_HOST = '127.0.0.1';
const SERVER_PORT = 3000;

const clientSocket = new net.Socket();

let receivedPackets = [];
let missingPacketSequences = new Set();

clientSocket.connect(SERVER_PORT, SERVER_HOST, () => {
  console.log('Connected to server');
  const initialRequest = buildRequestPayload(1);  
  clientSocket.write(initialRequest);
});

clientSocket.on('data', (data) => {
  processReceivedData(data);
});

clientSocket.on('close', () => {
  checkAndRequestMissingPackets();
});

clientSocket.on('error', (err) => {
  console.error('Connection error:', err);
});


function buildRequestPayload(requestType, sequenceNumber = 0) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt8(requestType, 0);
  buffer.writeUInt8(sequenceNumber, 1);
  return buffer;
}


function processReceivedData(data) {
  const PACKET_LENGTH = 17;
  
  for (let i = 0; i < data.length; i += PACKET_LENGTH) {
    const packet = data.slice(i, i + PACKET_LENGTH);
    const symbol = packet.slice(0, 4).toString('ascii');
    const buySell = packet.slice(4, 5).toString('ascii');
    const quantity = packet.readInt32BE(5);
    const price = packet.readInt32BE(9);
    const sequence = packet.readInt32BE(13);

    receivedPackets.push({ symbol, buySell, quantity, price, sequence });
  }
}


function checkAndRequestMissingPackets() {
  receivedPackets.sort((a, b) => a.sequence - b.sequence);


  for (let i = 0; i < receivedPackets.length - 1; i++) {
    const currentSequence = receivedPackets[i].sequence;
    const nextSequence = receivedPackets[i + 1].sequence;

    if (nextSequence !== currentSequence + 1) {
      for (let missingSeq = currentSequence + 1; missingSeq < nextSequence; missingSeq++) {
        missingPacketSequences.add(missingSeq);
      }
    }
  }

  
  if (missingPacketSequences.size > 0) {
    missingPacketSequences.forEach((seq) => {
      const resendRequest = buildRequestPayload(2, seq);  
      clientSocket.write(resendRequest);
    });

    
    clientSocket.on('data', (data) => {
      processReceivedData(data);

      
      if (missingPacketSequences.size === 0) {
        savePacketsToFile();
        clientSocket.end();  
      }
    });
  } else {
    
    savePacketsToFile();
  }
}


function savePacketsToFile() {
  fs.writeFileSync('output.json', JSON.stringify(receivedPackets, null, 2));
  console.log('Data saved to output.json');
}


