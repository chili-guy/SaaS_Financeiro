import 'dotenv/config';
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 [RAIO-X] Relatório Geral do Banco de Dados:");

  const users = await prisma.user.findMany({
    include: {
      _count: {
        select: { tasks: true, expenses: true, messages: true }
      }
    }
  });

  console.log(`\n📋 TOTAL DE USUÁRIOS: ${users.length}`);
  
  for (const u of users) {
    console.log(`\n👤 USUÁRIO ID: ${u.id} | FONE: ${u.phone_number}`);
    console.log(`   └─ Tarefas: ${u._count.tasks} | Gastos: ${u._count.expenses} | Mensagens: ${u._count.messages}`);
    
    if (u._count.tasks > 0) {
      const tasks = await prisma.task.findMany({ where: { user_id: u.id, completed: false } });
      console.log(`   └─ PENDENTES: ${tasks.map(t => t.title).join(", ")}`);
    }
  }

  console.log("\n📊 [FIM DO RELATÓRIO]");
}

main().catch(console.error).finally(() => prisma.$disconnect());
