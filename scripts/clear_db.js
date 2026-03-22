import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from "@prisma/client";

// --- Forçar carregamento manual do .env pois o dotenv está falhando no script isolado ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath   = path.join(__dirname, '../.env');

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
    }
  });
}

const prisma = new PrismaClient();

async function main() {
  console.log("🧼 Iniciando limpeza completa do Banco de Dados...");

  try {
    // Ordem importa por causa das chaves estrangeiras
    await prisma.message.deleteMany({});
    console.log("✅ Mensagens removidas.");
    
    await prisma.task.deleteMany({});
    console.log("✅ Tarefas removidas.");
    
    await prisma.expense.deleteMany({});
    console.log("✅ Gastos removidos.");
    
    await prisma.note.deleteMany({});
    console.log("✅ Notas removidas.");
    
    await prisma.user.deleteMany({});
    console.log("✅ Usuários removidos.");

    console.log("\n✨ BANCO DE DADOS 100% ZERADO E PRONTO PARA TESTES!");
  } catch (err) {
    console.error("❌ Erro ao limpar banco:", err.message);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error("❌ Erro fatal:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
