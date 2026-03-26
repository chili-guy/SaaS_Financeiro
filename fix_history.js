// fix_history.js — remove mensagens do assistente com padrão "Consulta realizada:"
// que ensinam a IA a replicar esse label em vez de executar a QUERY real.
// Não apaga tarefas, gastos, receitas nem usuários.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const deleted = await prisma.message.deleteMany({
    where: {
      role: "assistant",
      content: { startsWith: "Consulta realizada:" }
    }
  });
  console.log(`✅ ${deleted.count} mensagem(ns) contaminada(s) removida(s).`);
}

main()
  .catch(e => { console.error("❌", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
