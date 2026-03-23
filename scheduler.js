process.env.TZ = "America/Sao_Paulo";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const EVO_URL = process.env.EVOLUTION_API_URL || "http://evolution-api:8080";
const EVO_KEY = process.env.EVOLUTION_API_KEY || "FInAgentAPISecretKey_2026";
const INSTANCE = process.env.INSTANCE || "main";

async function checkReminders() {
    try {
        const now = new Date();
        const inFifteenMinutes = new Date(now.getTime() + 15 * 60 * 1000);

        // Busca TODAS as tarefas pendentes para processar as duas lógicas (15min e agora)
        const activeTasks = await prisma.task.findMany({
            where: {
                completed: false,
                due_date: { not: null, lte: inFifteenMinutes }
            },
            include: { user: true }
        });

        if (activeTasks.length > 0) {
            for (const task of activeTasks) {
                const dueDate = new Date(task.due_date);
                const createdAt = new Date(task.created_at);
                const diffCreatedToDue = dueDate.getTime() - createdAt.getTime();
                const isShortTermTask = diffCreatedToDue < (15 * 60 * 1000);
                
                const cleanNumber = task.user.phone_number.split('@')[0].replace(/\D/g, '');
                const endpoint = `${EVO_URL.replace(/\/$/, "")}/message/sendText/${INSTANCE}`;

                // --- LÓGICA 1: Notificação de 15 MINUTOS ANTES ---
                if (!isShortTermTask && !task.notified_5min && now < dueDate) {
                    console.log(`[Scheduler] Aviso de 15 min para ${cleanNumber}: ${task.title}`);
                    const text = `⏳ *FALTAM 15 MINUTOS!* \n\nOlá! Passo pra te lembrar que seu compromisso: \n*"${task.title}"*\ncomeça em breve! 🔔`;
                    
                    // Garante entrega via texto primeiro
                    await sendText(cleanNumber, text, INSTANCE);
                    // Tenta botões como extra
                    await sendEvolutionButtons(cleanNumber, "Opções:", INSTANCE, [
                        { id: "confirm_task", text: "Ver Agenda 📅" }
                    ]);

                    await prisma.task.update({
                        where: { id: task.id },
                        data: { notified_5min: true }
                    });
                }

                // --- LÓGICA 2: Notificação NO HORÁRIO (Real Time) ---
                if (now >= dueDate && !task.notified) {
                    console.log(`[Scheduler] Aviso NO HORÁRIO para ${cleanNumber}: ${task.title}`);
                    const text = `🔔 *HORA DO LEMBRETE!* \n\nOi! Chegou o horário de: \n*"${task.title}"*\n\nJá conseguiu concluir? Basta me avisar! 😊`;
                    
                    // Garante entrega via texto primeiro
                    await sendText(cleanNumber, text, INSTANCE);
                    // Tenta botões como extra
                    await sendEvolutionButtons(cleanNumber, "Opções:", INSTANCE, [
                        { id: "confirm_task", text: "Ver Agenda 📅" },
                        { id: "done_last", text: "Concluir Agora ✅" }
                    ]);

                    await prisma.task.update({
                        where: { id: task.id },
                        data: { notified: true }
                    });
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

async function sendText(number, text, instance) {
    const endpoint = `${EVO_URL.replace(/\/$/, "")}/message/sendText/${instance}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
            body: JSON.stringify({ number, text }),
            signal: controller.signal
        });
        if (res.ok) {
            console.log(`[Scheduler] ✅ Texto enviado para ${number}`);
        } else {
            console.error(`[Scheduler] ❌ Erro texto (${res.status}) para ${number}`);
        }
    } catch (e) {
        console.error("❌ Erro sendText Scheduler:", e.message);
    } finally {
        clearTimeout(timeoutId);
    }
}

async function sendEvolutionButtons(number, text, instance, buttons) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
        const endpoint = `${EVO_URL.replace(/\/$/, "")}/message/sendButtons/${instance}`;
        const formattedButtons = buttons.map(b => ({
            type: "reply",
            displayText: b.text,
            id: b.id
        }));

        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
            body: JSON.stringify({
                number,
                title: "Assessor Nico",
                description: text,
                footer: "Toque em um botão para agir",
                buttons: formattedButtons
            }),
            signal: controller.signal
        });

        if (response.ok) {
            console.log(`[Scheduler] ✅ Botões enviados para ${number}`);
            return true;
        } else {
            const errData = await response.text();
            console.error(`[Scheduler] ❌ Erro botões (${response.status}) para ${number}:`, errData);
            return false;
        }
    } catch (e) {
        console.error("❌ Erro sendButtons Scheduler:", e.message);
        return false;
    } finally {
        clearTimeout(timeoutId);
    }
}
