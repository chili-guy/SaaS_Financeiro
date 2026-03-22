import 'dotenv/config';
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🧼 Iniciando limpeza completa do Banco de Dados...");

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
}

main()
  .catch((e) => {
    console.error("❌ Erro ao limpar banco:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
