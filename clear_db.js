import { PrismaClient } from "@prisma/client";

// O script agora assume que a DATABASE_URL já foi injetada no ambiente via terminal
const prisma = new PrismaClient();

async function main() {
  console.log("🧼 Iniciando limpeza completa do Banco de Dados...");

  try {
    // Ordem importa por causa das chaves estrangeiras
    await prisma.message.deleteMany({});
    console.log("✅ Histórico de Mensagens removido.");
    
    await prisma.task.deleteMany({});
    console.log("✅ Tarefas removidas.");
    
    await prisma.expense.deleteMany({});
    console.log("✅ Gastos removidos.");
    
    await prisma.note.deleteMany({});
    console.log("✅ Notas removidas.");
    
    await prisma.income.deleteMany({});
    console.log("✅ Receitas removidas.");
    
    await prisma.user.deleteMany({});
    console.log("✅ Usuários removidos.");

    console.log("\n✨ BANCO DE DADOS 100% ZERADO!");
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
