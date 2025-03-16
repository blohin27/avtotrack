import * as net from 'net';
import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();
const PORT = 4500;

const dbClient = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

dbClient.connect()
  .then(() => console.log('Подключено к PostgreSQL'))
  .catch((err) => console.error('Ошибка подключения к PostgreSQL:', err));

interface EGTSData {
  packetId: number;
  latitude: number;
  longitude: number;
  speed: number;
  course: number;
  altitude: number;
  timestamp: string;
}

const saveDataToDB = async (data: EGTSData) => {
  const query = `
    INSERT INTO gps_data (packet_id, latitude, longitude, speed, course, altitude, timestamp)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `;
  const values = [
    data.packetId,
    data.latitude,
    data.longitude,
    data.speed,
    data.course,
    data.altitude,
    data.timestamp,
  ];

  try {
    await dbClient.query(query, values);
  } catch (error) {
    console.error('Ошибка при записи данных в PostgreSQL:', error);
  }
};

const parseEGTSData = (buffer: Buffer): EGTSData => {
  if (buffer.length < 20) {
    throw new Error('Слишком короткий пакет EGTS');
  }

  return {
    packetId: buffer.readUInt16LE(4),
    latitude: buffer.readInt32LE(6) / 1000000,
    longitude: buffer.readInt32LE(10) / 1000000,
    speed: buffer.readUInt16LE(14),
    course: buffer.readUInt16LE(16),
    altitude: buffer.readUInt16LE(18),
    timestamp: new Date().toISOString(),
  };
};

const sendEGTSResponse = (socket: net.Socket, packetId: number) => {
  const response = Buffer.alloc(11);
  response.writeUInt8(0x01, 0); // Версия протокола EGTS
  response.writeUInt8(0x00, 1); // Security key ID
  response.writeUInt16LE(0x000b, 2); // Длина пакета
  response.writeUInt16LE(packetId, 4); // Packet ID
  response.writeUInt8(0x00, 6); // Тип ответа (EGTS_PT_RESPONSE)
  response.writeUInt8(0x00, 7); // Флаги пакета
  response.writeUInt8(0x00, 8); // Код результата обработки (успешно)
  response.writeUInt16LE(0x0000, 9); // CRC (упрощенно)

  socket.write(response);
  console.log(`Отправлено подтверждение для пакета ID: ${packetId}`);
};

const server = net.createServer((socket) => {
  console.log('Трекер подключен:', socket.remoteAddress);

  socket.on('data', async (data: Buffer) => {
    try {
      const parsedData = parseEGTSData(data);
      console.log('Получены данные:', parsedData);

      await Promise.all([
        saveDataToDB(parsedData),
      ]);

      sendEGTSResponse(socket, parsedData.packetId);
    } catch (err) {
      console.error('Ошибка обработки данных:', err);
    }
  });

  socket.on('end', () => {
    console.log('Трекер отключился:', socket.remoteAddress);
  });

  socket.on('error', (err) => {
    console.error('Ошибка соединения:', err);
  });
});

server.listen(PORT, () => {
  console.log(`Сервер запущен на ${PORT}`);
});

process.on('exit', () => {
  dbClient.end();
});



