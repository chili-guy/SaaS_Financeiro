import React from 'react';

const ThanksPage = () => {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center relative overflow-hidden px-6">
      {/* Abstract Background Blobs - Consistency with Landing Page */}
      <div className="absolute top-[-10%] left-[-5%] w-[600px] h-[600px] bg-[#7C3AED]/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[600px] h-[600px] bg-[#3B82F6]/5 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-xl w-full relative z-10 text-center space-y-8 bg-white/50 backdrop-blur-xl p-12 rounded-[2.5rem] border border-[#F1F5F9] shadow-[0_40px_80px_rgba(0,0,0,0.05)]">
        {/* Animated Checkmark Circle */}
        <div className="flex justify-center">
            <div className="w-24 h-24 rounded-full bg-[#7C3AED] flex items-center justify-center shadow-lg shadow-[#7C3AED]/30 animate-pulse">
                <span className="material-symbols-outlined text-white text-[3rem] font-bold">check</span>
            </div>
        </div>

        <div className="space-y-4">
            <h1 className="font-headline font-black text-4xl text-[#111827] tracking-tight">
                Pagamento Confirmado! 🎉
            </h1>
            <p className="font-body text-[#64748B] text-lg leading-relaxed">
                Bem-vindo ao <span className="text-[#111827] font-bold">Assessor Nico</span>. <br/>Sua jornada para uma organização financeira sem planilhas começou!
            </p>
        </div>

        <div className="bg-[#F8FAFC] border border-[#F1F5F9] p-6 rounded-2xl text-left space-y-3">
             <div className="flex items-start gap-4">
                <div className="min-w-[40px] h-10 rounded-full bg-[#7C3AED]/10 flex items-center justify-center mt-1">
                    <span className="material-symbols-outlined text-[#7C3AED] text-xl">sms</span>
                </div>
                <p className="font-body text-[#475569] text-[0.95rem] leading-relaxed">
                   Você receberá um <span className="text-[#111827] font-bold">SMS de confirmação</span> em breve no número cadastrado durante o checkout.
                </p>
             </div>
             <div className="flex items-start gap-4">
                <div className="min-w-[40px] h-10 rounded-full bg-[#22c55e]/10 flex items-center justify-center mt-1">
                    <span className="material-symbols-outlined text-[#22c55e] text-xl">forum</span>
                </div>
                <p className="font-body text-[#475569] text-[0.95rem] leading-relaxed">
                   O Nico entrará em contato pelo seu <span className="text-[#111827] font-bold">WhatsApp</span> para iniciar seu atendimento personalizado.
                </p>
             </div>
        </div>

        <div className="pt-4">
            <button 
                onClick={() => window.location.href = '/'}
                className="w-full bg-[#111827] text-white font-headline font-bold py-5 rounded-full hover:bg-black transition-all shadow-lg hover:scale-[1.02] transform uppercase tracking-widest text-[0.9rem]"
            >
                Retornar ao Site
            </button>
        </div>
        
        <p className="text-[#94A3B8] text-xs font-body font-medium uppercase tracking-[0.2em]">
            Pode fechar esta página agora se preferir.
        </p>
      </div>
    </div>
  );
};

export default ThanksPage;
