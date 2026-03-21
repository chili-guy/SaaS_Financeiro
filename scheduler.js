import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const EVO_URL = process.env.EVOLUTION_API_URL || "http://evolution-api:8080";
const EVO_KEY = process.env.EVOLUTION_API_KEY || "FInAgentAPISecretKey_2026";
const INSTANCE = process.env.EVO_INSTANCE || "main";

async function checkReminders() {
    try {
        const now = new Date();
        console.log(`[Scheduler Check] Hora atual: ${now.toISOString()}`);

        const tasksToNotify = await prisma.task.findMany({
            where: {
                due_date: { lte: now },
                completed: false,
                notified: false
            },
            include: { user: true }
        });

        if (tasksToNotify.length > 0) {
            console.log(`[Scheduler] Encontradas ${tasksToNotify.length} tarefas pendentes.`);
            
            for (const task of tasksToNotify) {
                // Limpa o número: remove '@s.whatsapp.net' e qualquer caractere não numérico
                const cleanNumber = task.user.phone_number.split('@')[0].replace(/\D/g, '');
                const endpoint = `${EVO_URL.replace(/\/$/, "")}/message/sendText/${INSTANCE}`;
                
                console.log(`[Scheduler] Tentando enviar para ${cleanNumber} - Tarefa: ${task.title}`);
                
                const response = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
                    body: JSON.stringify({
                        number: cleanNumber,
                        text: `🔔 *LEMBRETE DO NICO* \n\nOlá! Vim te lembrar de: \n*"${task.title}"*\n\nVocê já concluiu? Me avise por aqui! 😊`
                    })
                });

                const result = await response.json();
                console.log(`[Scheduler] Resposta da API Evolution para ${cleanNumber}:`, JSON.stringify(result));

                if (response.ok) {
                    await prisma.task.update({
                        where: { id: task.id },
                        data: { notified: true }
                    });
                    console.log(`[Scheduler] Sucesso: Tarefa "${task.title}" marcada como notificada.`);
                } else {
                    console.error(`[Scheduler] Falha ao enviar para ${cleanNumber}. Status: ${response.status}`);
                }
            }
        }
    } catch (error) {
        console.error("❌ [Scheduler Error]:", error);
    }
}

// Roda a cada 1 minuto
console.log("🚀 [Scheduler] Iniciado! Verificando lembretes a cada 60s.");
setInterval(checkReminders, 60000);
