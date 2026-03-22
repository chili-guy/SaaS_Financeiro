import React, { useState, useEffect } from 'react';
import ChatMockup from './ChatMockup';
import './index.css';

const Logo = ({ className = "h-10", dark = false }) => (
  <div className={`flex items-center gap-2.5 ${className} transition-transform duration-300 hover:scale-[1.05]`} aria-label="Assessor Nico Logo">
    <div className="h-full aspect-square relative flex items-center justify-center">
      <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-sm overflow-visible">
        <defs>
          <linearGradient id="nicoLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{stopColor: '#8B5CF6', stopOpacity: 1}} />
            <stop offset="100%" style={{stopColor: '#7C3AED', stopOpacity: 1}} />
          </linearGradient>
        </defs>
        <path 
          d="M50,15 C30.67,15 15,30.67 15,50 C15,58.85 18.25,66.95 23.6,73.15 L16.5,88.5 L33.25,82.75 C38.35,84.2 43.8,85 50,85 C69.33,85 85,69.33 85,50 C85,30.67 69.33,15 50,15 Z" 
          fill="url(#nicoLogoGrad)"
        />
        <path 
          d="M38 48L47 57L65 39" 
          stroke="white" 
          strokeWidth="8" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          fill="none"
        />
      </svg>
    </div>
    <div className="flex items-center gap-1.5 leading-none py-1">
       <span className="font-black text-[#7C3AED] text-[1.25rem] md:text-[1.5rem] tracking-tighter">Nico</span>
       <span className={`font-medium ${dark ? 'text-white' : 'text-[#64748B]'} text-[1.25rem] md:text-[1.5rem] tracking-tight`}>Assessor</span>
    </div>
  </div>
);

const reviews1 = [
  { name: "João Paulo", role: "Empreendedor", text: "Cara, a melhor coisa que fiz foi usar o Nico. Minha fatura do cartão despencou sem eu nem perceber." },
  { name: "Mariana T.", role: "Autônoma", text: "Não preciso mais lembrar de anotar gastos. Só mando uma mensagem rápida e tá resolvido." },
  { name: "Roberto D.", role: "Médico", text: "A gestão de agenda é sensacional. O Nico me avisa dos horários muito melhor que qualquer app." },
  { name: "Luiza S.", role: "Designer", text: "Achei que ia ser difícil mexer, mas como é tudo direto no teclado do WhatsApp, foi super natural." },
  { name: "Thiago M.", role: "Empresário", text: "Muito bom. Fluxo de caixa de empresa pequena é bagunça, e o Nico organiza tudo perfeitamente." },
  { name: "Camila V.", role: "Arquiteta", text: "Organização nota 1000! Não vivo mais sem o Nico pra lembrar de pagar os fornecedores da obra." }
];

const reviews2 = [
  { name: "Pedro H.", role: "Consultor", text: "Ter meus recebíveis e contas a pagar do mês listados num relatório todo dia cedo mudou a saúde da minha empresa." },
  { name: "Carolina M.", role: "Dentista", text: "Excelente para profissionais da saúde. Registro os retornos e o Nico me avisa de cada um." },
  { name: "Rafael C.", role: "Freelancer", text: "Controlar pagamentos fracionados de clientes era meu terror. O assessor virtual transformou esse pesadelo numa notificação simples." },
  { name: "Bruno L.", role: "Gestor Clínico", text: "Simplicidade pura, meus funcionários só lançam no WhatsApp e está tudo registrado. Adeus planilha de drive." },
  { name: "Isabela R.", role: "Social Media", text: "Sou 100% dinâmica e a praticidade do WhatsApp foi a combinação que eu precisava pra minha rotina corrida." },
  { name: "Gabriel S.", role: "Lojista", text: "Lançar cada entrada agora é rápido. O fechamento de caixa que levava 2 horas, hoje eu bato tudo em 5 minutos com o Nico." }
];

const faqs = [
  {
    q: "Como o Nico funciona na prática?",
    a: "É muito simples. Você adiciona o número do Nico no seu WhatsApp como se fosse um contato normal. Sempre que tiver um gasto, receber um pagamento ou precisar marcar um compromisso, basta mandar uma mensagem de texto (ex: 'Gastei 150 reais no supermercado'). O Nico entende, categoriza e lança no seu painel automaticamente."
  },
  {
    q: "Meus dados financeiros estão seguros?",
    a: "Sim, utilizamos criptografia de ponta-a-ponta nativa do WhatsApp e bancos de dados isolados. O que significa que os detalhes financeiros trocados na plataforma não são visíveis a humanos. Seu painel web tem camadas extras de autenticação."
  },
  {
    q: "Preciso baixar algum aplicativo?",
    a: "Não! A grande vantagem do Nico é que 90% da sua interação diária acontece pelo aplicativo que você já usa: o WhatsApp. Seus relatórios, configurações e gráficos detalhados podem ser acessados via navegador de internet em um painel web que não requer instalação de nada novo."
  },
  {
    q: "O Nico entende áudios?",
    a: "No momento o Nico processa apenas mensagens de texto. Focamos na precisão máxima do texto para garantir que cada centavo e cada compromisso seja registrado com 100% de segurança, sem erros de transcrição que poderiam bagunçar sua organização."
  },
  {
    q: "E se eu errar uma informação na mensagem, como corrijo?",
    a: "É tão orgânico quanto conversar com um humano. Basta você enviar logo em seguida: 'Nico, desculpe, o gasto anterior não foi no débito, foi no crédito em 3x'. Ele compreende o contexto temporal e atualiza a entrada anterior antes que feche qualquer relatório do dia."
  }
];

function FAQItem({ question, answer }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border-b border-[#e2e8f0] py-6 last:border-b-0">
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="w-full flex justify-between items-center text-left transition-colors group"
      >
        <span className="font-headline font-bold text-[#111827] text-[1.05rem] md:text-[1.15rem] group-hover:text-[#7C3AED] transition-colors">{question}</span>
        <span className={`material-symbols-outlined text-[#7C3AED] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-96 mt-4 opacity-100' : 'max-h-0 opacity-0'}`}>
        <p className="font-body text-[#64748B] text-[1rem] leading-[1.7] pr-8">{answer}</p>
      </div>
    </div>
  );
}

function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="bg-white text-[#111827] font-body selection:bg-[#7C3AED]/20 selection:text-[#7C3AED] overflow-x-hidden">
      
      {/* Navigation */}
      <nav className={`fixed w-full z-[100] transition-all duration-300 ${scrollY > 50 ? 'bg-white/90 backdrop-blur-xl shadow-sm border-b border-[#F1F5F9]' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto flex justify-between items-center px-6 py-6 md:py-6">
          {/* Brand Logo - Nico Assessor */}
          <a href="/" className="flex items-center">
            <Logo className="h-8 md:h-12" />
          </a>
          
          {/* Desktop Links (Hidden on Mobile) */}
          <div className="hidden lg:flex items-center space-x-10 font-body text-[0.95rem] font-medium text-[#64748B]">
            <a className="hover:text-[#7C3AED] transition-colors" href="#como-funciona">Como funciona</a>
            <a className="hover:text-[#7C3AED] transition-colors" href="#avaliacoes">Avaliações</a>
            <a className="hover:text-[#7C3AED] transition-colors" href="#planos">Planos</a>
          </div>
          
          {/* Actions - Login Removed */}
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="lg:hidden text-[#111827] p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined text-3xl">{isMenuOpen ? 'close' : 'menu'}</span>
            </button>
          </div>
        </div>

        {/* Mobile Menu Overlay */}
        <div className={`lg:hidden absolute top-full left-0 w-full bg-white border-b border-[#F1F5F9] shadow-xl transition-all duration-300 ${isMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible h-0 overflow-hidden'}`}>
           <div className="flex flex-col p-8 space-y-6 font-headline font-bold text-center">
              <a onClick={() => setIsMenuOpen(false)} className="text-xl text-[#111827] hover:text-[#7C3AED]" href="#como-funciona">Como funciona</a>
              <a onClick={() => setIsMenuOpen(false)} className="text-xl text-[#111827] hover:text-[#7C3AED]" href="#avaliacoes">Avaliações</a>
              <a onClick={() => setIsMenuOpen(false)} className="text-xl text-[#111827] hover:text-[#7C3AED]" href="#planos">Planos</a>
              <hr className="border-[#F1F5F9]" />
              <a href="https://wa.me/assessornico" className="bg-[#22c55e] text-white py-4 rounded-full text-lg shadow-lg shadow-[#22c55e]/20">Começar Agora</a>
           </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-24 md:pt-40 pb-0 flex flex-col items-center justify-center text-center px-6 overflow-hidden bg-white" id="como-funciona">
        <div className="max-w-[1000px] relative z-10 mx-auto flex flex-col items-center">
          
          {/* Top subtle text */}
          <p className="text-[#7C3AED] text-[0.75rem] md:text-[0.9rem] font-body font-bold tracking-widest mb-6 uppercase">
            Transforme seu WhatsApp em um Assessor Pessoal
          </p>
          
          {/* Main Headline (Responsive) */}
          <h1 className="text-[2.2rem] sm:text-[2.8rem] md:text-[3.8rem] font-headline font-black leading-[1.1] md:leading-[1.05] tracking-tighter text-[#111827] mb-8">
            Tenha um assessor pessoal <span className="md:block text-[#7C3AED]">trabalhando 24h</span> pra você
          </h1>

          {/* 3 Detail Badges (Simplified on Mobile) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-16 justify-center w-full max-w-[850px]">
            {/* Feature 1 */}
            <div className="flex items-center gap-4 bg-[#F8FAFC] border border-[#F1F5F9] p-4 rounded-2xl text-left shadow-sm">
              <span className="material-symbols-outlined text-[#eab308] text-2xl" style={{fontVariationSettings: "'FILL' 1"}}>verified_user</span>
              <p className="font-headline font-bold text-[0.85rem] text-[#111827]">Criptografia de ponta-a-ponta</p>
            </div>
            {/* Feature 2 */}
            <div className="flex items-center gap-4 bg-[#F8FAFC] border border-[#F1F5F9] p-4 rounded-2xl text-left shadow-sm border-l-4 border-l-[#7C3AED]">
              <span className="material-symbols-outlined text-[#7C3AED] text-2xl" style={{fontVariationSettings: "'FILL' 1"}}>auto_awesome</span>
              <p className="font-headline font-bold text-[0.85rem] text-[#111827]">IA treinada para Português</p>
            </div>
            {/* Feature 3 */}
            <div className="flex items-center gap-4 bg-[#F8FAFC] border border-[#F1F5F9] p-4 rounded-2xl text-left shadow-sm">
              <span className="material-symbols-outlined text-[#111827] text-2xl" style={{fontVariationSettings: "'FILL' 1"}}>edit_document</span>
              <p className="font-headline font-bold text-[0.85rem] text-[#111827]">Edite mensagens via chat</p>
            </div>
          </div>

          {/* Green CTA Button  */}
          <a href="https://wa.me/assessornico" className="group bg-[#22c55e] text-white font-headline font-black text-[1rem] px-14 py-5 rounded-full hover:bg-[#16a34a] hover:scale-[1.05] transition-all duration-300 shadow-[0_20px_40px_rgba(34,197,94,0.3)] mb-20 uppercase flex items-center justify-center gap-3 tracking-widest">
            COMEÇAR AGORA
            <span className="material-symbols-outlined font-black text-2xl group-hover:translate-x-1 transition-transform">arrow_forward</span>
          </a>
        </div>

        {/* Hero Phones - Uniform Tri-Mockup Layout */}
        <div className="relative w-full max-w-7xl mx-auto h-auto z-10 flex flex-wrap justify-center gap-6 md:gap-12 px-4 items-center mb-12 md:mb-24 overflow-visible">
          
          {/* Left Phone (Uniform Size) */}
          <div className="w-[300px] sm:w-[320px] z-10 hidden lg:block transition-all duration-500 hover:-translate-y-2 rounded-[3rem] shadow-[0_30px_60px_rgba(0,0,0,0.3)]">
             <div className="rounded-[3rem] bg-[#111] border-[8px] md:border-[10px] border-[#222] overflow-hidden aspect-[9/19]">
                <ChatMockup isStatic={true} staticOffset={0} />
             </div>
          </div>
          
          {/* Center Phone (Uniform Size) */}
          <div className="w-full sm:w-[320px] z-20 transition-all duration-500 hover:-translate-y-2 rounded-[3.2rem] shadow-[0_40px_80px_rgba(0,0,0,0.4)] scale-[1.12] sm:scale-100">
              <div className="rounded-[3.2rem] bg-[#111] border-[4px] sm:border-[10px] border-[#222] overflow-hidden aspect-[9/19] relative">
                <ChatMockup />
                {/* Visual Glow */}
                <div className="absolute -inset-20 bg-[#7C3AED]/15 blur-[100px] pointer-events-none -z-10 rounded-full"></div>
              </div>
          </div>
          
          {/* Right Phone (Uniform Size) */}
          <div className="w-[300px] sm:w-[320px] z-10 hidden lg:block transition-all duration-500 hover:-translate-y-2 rounded-[3rem] shadow-[0_30px_60px_rgba(0,0,0,0.3)]">
             <div className="rounded-[3rem] bg-[#111] border-[8px] md:border-[10px] border-[#222] overflow-hidden aspect-[9/19]">
                <ChatMockup isStatic={true} staticOffset={44} />
             </div>
          </div>

          {/* Background Decorative Rings/Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[110%] aspect-square border-2 border-dashed border-[#7C3AED]/10 rounded-full -z-10 animate-spin-slow"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] aspect-square border-2 border-dashed border-[#7C3AED]/5 rounded-full -z-10 animate-spin-slow-reverse"></div>
        </div>
      </section>

      {/* Full Width Theme Banner */}
      <section className="w-full bg-[#7C3AED] text-white py-14 px-6 relative z-20">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-12">
           <div className="md:w-1/2 flex items-center justify-center md:justify-center">
             <div className="relative text-center">
               <h2 className="text-4xl md:text-[3rem] font-headline font-extrabold leading-[1.05]">
                 Sua vida<br/>organizada.<br/>
                 <span className="relative inline-block border-[3px] border-white rounded-full px-6 py-1 mt-2 rotate-[-3deg]">
                    Sem esforço.
                 </span>
               </h2>
             </div>
           </div>
           <div className="md:w-1/2 font-body text-[1.1rem] leading-[1.6]">
             <p className="mb-4 font-medium">
               Já se perdeu no meio de tarefas e despesas?<br/>Esqueceu compromissos ou levou um susto com a fatura do cartão?
             </p>
             <p className="font-bold">
               O <strong className="text-[#a78bfa]">Assessor Nico</strong> resolve isso: organização financeira e gestão de compromissos, tudo de forma simples e direta pelo WhatsApp.
             </p>
           </div>
        </div>
      </section>

      {/* Block 1: FINANCEIRO */}
      <section className="py-16 md:py-32 px-6 bg-white overflow-hidden relative" id="financeiro">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
          {/* Text Content */}
          <div className="flex-1 space-y-8 lg:max-w-[540px]">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#7C3AED]/10 text-[#7C3AED] text-[0.7rem] font-bold tracking-widest uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-[#7C3AED] animate-pulse"></span>
              Gestão Financeira
            </div>
            <h2 className="text-[2.8rem] md:text-[3.8rem] font-headline font-black leading-[1.05] text-[#111827] tracking-tighter">
              Organização <br /><span className="text-[#7C3AED]">sem planilhas.</span>
            </h2>
            <div className="space-y-6 text-[#64748B] text-[1.1rem] font-body leading-relaxed">
              <p>
                O <span className="text-[#111827] font-semibold">Assessor Nico</span> transforma mensagens simples em registros financeiros estruturados. Basta enviar: <span className="text-[#7C3AED] italic font-medium">"Gastei 50 no almoço"</span> ou <span className="text-[#7C3AED] italic font-medium">"Paguei 200 de luz hoje"</span>.
              </p>
              <p>
                Nossa inteligência artificial classifica automaticamente a categoria e extrai valores para o seu controle total em tempo real, sem que você precise abrir um app.
              </p>
            </div>
            <div className="pt-4 flex flex-wrap gap-4">
              <a href="https://wa.me/assessornico" className="bg-[#7C3AED] text-white px-10 py-4 rounded-full font-headline font-bold text-[0.95rem] hover:bg-[#4C1D95] transition-all duration-300 transform active:scale-95 shadow-xl shadow-[#7C3AED]/20 uppercase tracking-widest flex items-center gap-3">
                TESTAR AGORA
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </a>
            </div>
          </div>
          
          {/* Visual Content: Abstract Finance */}
          <div className="flex-1 relative group w-full max-w-[640px]">
            <div className="absolute -inset-20 bg-[#7C3AED]/10 blur-[120px] rounded-full opacity-60 animate-pulse"></div>
            
            {/* Main Creative Container */}
            <div className="relative z-10 rounded-[3rem] overflow-hidden shadow-[0_50px_100px_rgba(124,58,237,0.15)] border-[12px] border-white group-hover:scale-[1.02] transition-all duration-700 animate-float bg-[#0A0A0B]">
               <img loading="lazy" src="/assets/finance_abstract.png" alt="Financeiro Abstract Art" className="w-full aspect-square object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
               
               {/* Glass UI Surprise Overlay */}
               <div className="absolute bottom-10 left-10 right-10 bg-white/10 backdrop-blur-xl border border-white/20 p-8 rounded-[2rem] text-white shadow-2xl transform translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 delay-100">
                  <div className="flex items-center justify-between mb-4">
                     <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-green-400 shadow-[0_0_15px_rgba(74,222,128,0.5)]"></div>
                        <span className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-white/70">Nico Intelligence</span>
                     </div>
                     <span className="text-[0.6rem] font-mono text-white/40">ID: #F9281-XC</span>
                  </div>
                  <div className="space-y-1 text-left">
                    <p className="text-[0.8rem] text-white/60">Análise de Transação:</p>
                    <p className="text-[1.1rem] font-bold tracking-tight">Gasto em <span className="text-[#a78bfa]">Alimentação</span> Identificado</p>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* Block 2: COMPROMISSOS */}
      <section className="py-16 md:py-32 px-6 bg-[#F8FAFC] overflow-hidden relative" id="compromissos">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row-reverse items-center gap-12 lg:gap-20">
          {/* Text Content */}
          <div className="flex-1 space-y-8 lg:max-w-[540px]">
             <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#111827]/5 text-[#111827] text-[0.7rem] font-bold tracking-widest uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-[#111827] animate-pulse"></span>
              Gestão de Tempo
            </div>
            <h2 className="text-[2.8rem] md:text-[3.8rem] font-headline font-black leading-[1.05] text-[#111827] tracking-tighter">
              Sua agenda <br /><span className="text-[#7C3AED]">no automático.</span>
            </h2>
            <div className="space-y-6 text-[#64748B] text-[1.1rem] font-body leading-relaxed">
              <p>
                O <span className="text-[#111827] font-semibold">Assessor Nico</span> é seu secretário 24h. Registre tarefas e lembretes com linguagem natural: <span className="text-[#7C3AED] italic font-medium">"Tenho consulta médica dia 25 às 10h"</span>.
              </p>
              <p>
                O sistema identifica o horário e te envia uma mensagem de lembrete no WhatsApp exatamente quando você precisar. Nunca mais esqueça uma reunião ou compromisso.
              </p>
            </div>
            <div className="pt-4 flex items-start text-left">
              <a href="https://wa.me/assessornico" className="bg-[#111827] text-white px-10 py-4 rounded-full font-headline font-bold text-[0.95rem] hover:bg-black transition-all duration-300 transform active:scale-95 shadow-xl shadow-black/10 uppercase tracking-widest flex items-center gap-3 w-fit">
                ATIVAR SECRETÁRIO
                <span className="material-symbols-outlined text-lg">event_available</span>
              </a>
            </div>
          </div>
          
          {/* Visual Content: Abstract Schedule */}
          <div className="flex-1 relative group w-full max-w-[640px]">
             <div className="absolute -inset-20 bg-[#111827]/5 blur-[120px] rounded-full opacity-60"></div>
             
             {/* Main Creative Container */}
             <div className="relative z-10 rounded-[3rem] overflow-hidden shadow-[0_50px_100px_rgba(0,0,0,0.1)] border-[12px] border-white group-hover:scale-[1.02] transition-all duration-700 animate-float [animation-delay:1.5s] bg-[#0A0A0B]">
               <img loading="lazy" src="/assets/schedule_abstract.png" alt="Compromissos Abstract Art" className="w-full aspect-square object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
               
               {/* Glass UI Surprise Overlay */}
               <div className="absolute top-10 left-10 right-10 bg-black/40 backdrop-blur-xl border border-white/10 p-8 rounded-[2rem] text-white shadow-2xl transform -translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 delay-100">
                  <div className="flex items-center gap-4 text-left">
                    <div className="w-12 h-12 rounded-2xl bg-[#7C3AED] flex items-center justify-center shadow-[0_10px_20px_rgba(124,58,237,0.4)]">
                        <span className="material-symbols-outlined text-white">notifications_active</span>
                    </div>
                    <div>
                      <p className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-white/50 mb-1">Lembrete Ativo</p>
                      <p className="text-[1.1rem] font-bold tracking-tight italic">"Consulta Médica em 15min"</p>
                    </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* Block 3: Registre tudo no WhatsApp - Redesigned for Premium Look */}
      <section className="py-16 md:py-32 px-6 bg-[#F8FAFC] relative overflow-hidden border-b border-[#F1F5F9]" id="tecnologia">
        {/* IBM-style Grid Background */}
        <div className="absolute inset-0 opacity-[0.4] pointer-events-none" 
             style={{ 
               backgroundImage: `radial-gradient(#cbd5e1 1.5px, transparent 1.5px)`, 
               backgroundSize: '32px 32px' 
             }}>
        </div>

        {/* Decorative Floating Elements (Designer's Touch) */}
        <div className="absolute top-1/4 -left-20 w-80 h-80 purple-glow bg-[#7C3AED]/20 rounded-full blur-[100px] pointer-events-none opacity-40"></div>
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 purple-glow bg-[#A78BFA]/20 rounded-full blur-[120px] pointer-events-none opacity-30"></div>
        
        {/* Floating Glass Shapes */}
        <div className="absolute top-20 right-[15%] w-24 h-24 glass-shape rounded-3xl rotate-12 float-slow opacity-20 hidden lg:block"></div>
        <div className="absolute bottom-40 left-[10%] w-16 h-16 glass-shape rounded-full float-medium opacity-20 hidden lg:block"></div>

        {/* Spline 3D Animation - "Free" on the Right Side (Desktop) */}
        <div className="absolute right-[-10%] top-1/2 -translate-y-1/2 w-[70%] h-full z-0 pointer-events-auto hidden lg:block">
           <spline-viewer url="https://prod.spline.design/Xx9X55DsHvKD5uP9/scene.splinecode"></spline-viewer>
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
            
            {/* Content Column (6 cols) */}
            <div className="lg:col-span-6 flex flex-col items-start text-left order-1 relative z-10">
              <div className="inline-flex items-center gap-2 bg-[#7C3AED]/10 text-[#7C3AED] px-4 py-1.5 rounded-full text-xs font-bold mb-8 uppercase tracking-widest border border-[#7C3AED]/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#7C3AED] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#7C3AED]"></span>
                </span>
                Inteligência Natural
              </div>

              <h2 className="text-4xl md:text-[4.2rem] font-headline font-black text-[#111827] tracking-tighter leading-[1] mb-8">
                O Nico fala<br/><span className="text-[#7C3AED]">sua língua.</span>
              </h2>
              
              <p className="text-[#64748B] font-body text-xl leading-[1.6] mb-12 max-w-[540px]">
                O Assessor Nico funciona como um assistente real: esqueça comandos chatos. <span className="text-[#111827] font-semibold">Fale naturalmente</span> por texto e veja a mágica acontecer.
              </p>
              
              {/* Feature Bento-style Grid (Naked on Mobile) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-4 w-full">
                {/* Large Main Feature */}
                <div className="md:col-span-2 group md:bg-white p-0 md:p-6 rounded-[2rem] md:border md:border-[#e2e8f0] md:shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                  <div className="flex items-center md:items-start gap-5">
                    <div className="w-14 h-14 rounded-2xl bg-[#7C3AED] flex items-center justify-center shrink-0 shadow-lg shadow-[#7C3AED]/20">
                      <span className="material-symbols-outlined text-white text-2xl" style={{fontVariationSettings: "'FILL' 1"}}>psychology</span>
                    </div>
                    <div>
                      <p className="font-headline font-extrabold text-[#111827] text-xl leading-tight mb-1">Entende o Contexto</p>
                      <p className="text-[#64748B] font-body text-sm leading-relaxed max-w-[440px]">
                        Nossa IA interpreta frases complexas e gírias, identificando automaticamente se você relatou um gasto, pediu um lembrete ou guardou uma nota secreta.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Sub Features */}
                <div className="group md:bg-white/60 md:backdrop-blur-sm p-0 md:p-6 rounded-[2rem] md:border md:border-[#e2e8f0] md:shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                  <div className="w-12 h-12 rounded-xl bg-[#7C3AED]/10 md:bg-white border border-[#F1F5F9] flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform">
                    <span className="material-symbols-outlined text-[#7C3AED] text-2xl">data_exploration</span>
                  </div>
                  <p className="font-headline font-bold text-[#111827] text-lg leading-tight mb-2">Extração de Dados</p>
                  <p className="text-[#64748B] font-body text-xs md:text-[11px] leading-[1.6]">Identifica valores, datas e descrições cruciais direto da sua mensagem, sem preenchimento manual.</p>
                </div>

                <div className="group md:bg-white/60 md:backdrop-blur-sm p-0 md:p-6 rounded-[2rem] md:border md:border-[#e2e8f0] md:shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                  <div className="w-12 h-12 rounded-xl bg-[#7C3AED]/10 md:bg-white border border-[#F1F5F9] flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform">
                    <span className="material-symbols-outlined text-[#7C3AED] text-2xl">bolt</span>
                  </div>
                  <p className="font-headline font-bold text-[#111827] text-lg leading-tight mb-2">Puro Tempo Real</p>
                  <p className="text-[#64748B] font-body text-xs md:text-[11px] leading-[1.6]">Lançamentos em milissegundos. Sem filas, sem espera. Seu financeiro atualiza no exato momento que você gasta.</p>
                </div>
              </div>
            </div>

            {/* Empty Column for Desktop (allows Absolute robot to visible), hidden on Mobile */}
            <div className="hidden lg:block lg:col-span-6 order-2"></div>

          </div>
        </div>
      </section>

      {/* Block 4: Inteligência e Tecnologia */}
      <section className="py-16 md:py-32 px-6 bg-[#F1F5F9] border-b border-white">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Visual Cards (Order 2 on Mobile, Order 1 on Desktop) */}
          <div className="order-2 lg:order-1">
             <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-[#e2e8f0]">
                <div className="space-y-6">
                   <div className="flex gap-4 p-4 rounded-xl bg-[#F8FAFC] border border-[#F1F5F9]">
                      <span className="material-symbols-outlined text-[#7C3AED] mt-1">psychology</span>
                      <div>
                        <h4 className="font-headline font-bold text-[#111827]">Processamento Natural</h4>
                        <p className="text-[#64748B] text-sm leading-relaxed">Nossa IA classifica se é uma tarefa, gasto ou anotação sem você precisar clicar em nada.</p>
                      </div>
                   </div>
                   <div className="flex gap-4 p-4 rounded-xl bg-[#F8FAFC] border border-[#F1F5F9]">
                      <span className="material-symbols-outlined text-[#7C3AED] mt-1">database</span>
                      <div>
                        <h4 className="font-headline font-bold text-[#111827]">PostgreSQL</h4>
                        <p className="text-[#64748B] text-sm leading-relaxed">Dados estruturados e seguros com histórico completo das suas interações.</p>
                      </div>
                   </div>
                   <div className="flex gap-4 p-4 rounded-xl bg-[#F8FAFC] border border-[#F1F5F9]">
                      <span className="material-symbols-outlined text-[#7C3AED] mt-1">cloud_done</span>
                      <div>
                        <h4 className="font-headline font-bold text-[#111827]">Disponibilidade 24/7</h4>
                        <p className="text-[#64748B] text-sm leading-relaxed">Hospedagem em nuvem garantindo que seu assessor nunca pare de trabalhar.</p>
                      </div>
                   </div>
                </div>
             </div>
          </div>

          {/* Text Content (Order 1 on Mobile, Order 2 on Desktop) */}
          <div className="order-1 lg:order-2 flex flex-col items-start lg:pl-12">
            <h2 className="text-4xl md:text-[3rem] font-headline font-bold text-[#111827] tracking-tight mb-8">
              Inteligência que<br/><span className="text-[#7C3AED]">te entende</span>
            </h2>
            <p className="text-[#64748B] font-body text-[1.1rem] leading-[1.7] mb-8">
              O Nico não é apenas um bot. Ele usa modelos de IA para interpretar o que você escreve e estruturar a informação da maneira correta.
            </p>
            <p className="text-[#111827] font-body italic font-bold text-lg mb-10 text-pretty">
              Tecnologia de ponta a serviço da sua produtividade diária.
            </p>
          </div>
        </div>
      </section>


      {/* Planos Section */}
      <section id="planos" className="py-16 md:py-32 px-6 bg-white border-b border-[#F1F5F9]">
        <div className="max-w-7xl mx-auto flex flex-col items-center">
          <div className="relative mb-4 block text-center">
            <h2 className="text-4xl md:text-[3rem] font-headline font-bold text-[#111827] tracking-tight text-center">Conheça nossos planos</h2>
          </div>
          <p className="text-[#64748B] font-body text-lg text-center leading-[1.7] max-w-2xl mb-16">
            Organização financeira e pessoal direto no WhatsApp 24h por dia.
          </p>

          {/* Simpler, Thinner Centered Pricing Card */}
          <div className="flex justify-center">
            <div className="w-full max-w-md bg-[#0B1120] text-white rounded-[2.5rem] p-8 md:p-12 shadow-[0_40px_80px_rgba(11,17,32,0.25)] flex flex-col items-center border border-[#1f2937] relative overflow-hidden group transition-all duration-300 ring-4 ring-[#7C3AED]/20">
              {/* Background Glow */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[200px] bg-[#7C3AED]/20 blur-[80px] rounded-full pointer-events-none z-0"></div>
              
              <div className="relative z-10 w-full flex flex-col items-center text-center">
                <div className="inline-flex items-center gap-2 bg-[#7C3AED] px-4 py-1.5 rounded-full text-xs font-headline mb-8 shadow-lg shadow-[#7C3AED]/10">
                  <span className="font-black text-white tracking-widest uppercase">PLANO COMPLETO</span>
                </div>

                <div className="flex items-baseline gap-1.5 mb-2">
                   <span className="text-[#9ca3af] font-body font-bold text-xl">R$</span>
                   <span className="text-white font-headline font-black text-[5rem] md:text-[6rem] leading-none tracking-tighter">9,90</span>
                   <span className="text-[#9ca3af] font-body font-medium">/mês</span>
                </div>
                <p className="text-[#9ca3af] text-[0.9rem] font-body mb-8 italic">Ideal para organização pessoal e financeira</p>

                <hr className="w-full border-[#1f2937] mb-8" />

                <ul className="flex flex-col gap-4 mb-10 w-full text-left max-w-xs mx-auto">
                   {[
                     "Registro de compromissos e tarefas",
                     "Registro de gastos e receitas",
                     "Classificação automática por IA",
                     "Lembretes ilimitados via WhatsApp",
                     "Consultas de itens em tempo real",
                     "Resumo diário da sua rotina",
                     "Suporte prioritário via WhatsApp"
                   ].map((feature, i) => (
                     <li key={i} className="flex items-start gap-3">
                        <span className="material-symbols-outlined text-[#22c55e] text-[1.1rem] mt-0.5" style={{fontVariationSettings: "'FILL' 1, 'wght' 700"}}>check</span>
                        <span className="text-[#e5e7eb] font-body text-[0.9rem] font-medium leading-tight">{feature}</span>
                     </li>
                   ))}
                </ul>

                <div className="w-full">
                  <a href="https://wa.me/assessornico?text=Quero%20assinar%20o%20plano" className="block w-full bg-[#22c55e] text-white text-center font-headline font-bold text-[1.1rem] py-5 rounded-full hover:bg-[#16a34a] transition-all duration-300 shadow-[0_15px_30px_rgba(34,197,94,0.3)] mb-4">
                     Garanta Já
                  </a>
                  
                  <p className="w-full text-center text-[#9ca3af] text-[10px] font-body font-bold uppercase tracking-widest opacity-70">
                     Acesso Vitalício Promocional
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Avaliações com Scroll Infinito (2 Fileiras) */}
      <section id="avaliacoes" className="py-28 bg-white overflow-hidden">
        <div className="max-w-6xl mx-auto flex flex-col items-center mb-16 px-6">
          <div className="relative mb-6 block text-center">
             <h2 className="text-4xl md:text-[3rem] font-headline font-bold text-[#111827] tracking-tight text-center uppercase">O QUE DIZEM NOSSOS CLIENTES</h2>
             <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-24 h-1.5 bg-[#7C3AED] rounded-full"></div>
          </div>
          <p className="text-[#64748B] font-body text-lg text-center leading-[1.7] max-w-2xl mt-4">
            Profissionais que pararam de perder tempo preenchendo planilhas e começaram a aproveitar mais a vida usando o Nico.
          </p>
        </div>

        {/* Marquee Container with 2 Rows */}
        <div className="relative w-full max-w-[1500px] mx-auto overflow-hidden before:absolute before:left-0 before:top-0 before:z-20 before:h-full before:w-[50px] md:before:w-[200px] before:bg-gradient-to-r before:from-white before:to-transparent after:absolute after:right-0 after:top-0 after:z-20 after:h-full after:w-[50px] md:after:w-[200px] after:bg-gradient-to-l after:from-white after:to-transparent flex flex-col gap-6">
          
          {/* Row 1: Scrolling Left */}
          <div className="flex w-max animate-marquee hover:[animation-play-state:paused] gap-6 px-3">
             {[...reviews1, ...reviews1, ...reviews1].map((review, i) => (
               <div key={`r1-${i}`} className="flex-shrink-0 w-[350px] md:w-[400px] p-8 rounded-[1.5rem] bg-[#F1F5F9] border border-[#e2e8f0] flex flex-col justify-between transition-transform duration-300 hover:scale-[1.02] cursor-default">
                  <div className="mb-8">
                    <div className="flex gap-1 text-[#eab308] mb-6">
                        {[...Array(5)].map((_, index) => (
                           <svg key={index} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                             <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
                           </svg>
                        ))}
                     </div>
                    <p className="text-[#111827] font-body text-[1.05rem] leading-[1.65] font-medium">"{review.text}"</p>
                  </div>
                  <div className="flex items-center gap-4 border-t border-[#e2e8f0] pt-6">
                     <div className="w-12 h-12 rounded-full bg-[#7C3AED] font-headline font-bold text-lg text-white flex items-center justify-center">
                        {review.name.charAt(0)}
                     </div>
                     <div>
                       <p className="text-[#111827] font-headline font-bold text-[0.95rem] tracking-wide">{review.name}</p>
                       <p className="text-[#64748B] font-body font-medium text-sm">{review.role}</p>
                     </div>
                  </div>
               </div>
             ))}
          </div>

          {/* Row 2: Scrolling Right */}
          <div className="flex w-max animate-marquee-reverse hover:[animation-play-state:paused] gap-6 px-3">
             {[...reviews2, ...reviews2, ...reviews2].map((review, i) => (
               <div key={`r2-${i}`} className="flex-shrink-0 w-[350px] md:w-[400px] p-8 rounded-[1.5rem] bg-[#F1F5F9] border border-[#e2e8f0] flex flex-col justify-between transition-transform duration-300 hover:scale-[1.02] cursor-default">
                  <div className="mb-8">
                    <div className="flex gap-1 text-[#eab308] mb-6">
                        {[...Array(5)].map((_, index) => (
                           <svg key={index} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                             <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
                           </svg>
                        ))}
                     </div>
                    <p className="text-[#111827] font-body text-[1.05rem] leading-[1.65] font-medium">"{review.text}"</p>
                  </div>
                  <div className="flex items-center gap-4 border-t border-[#e2e8f0] pt-6">
                     <div className="w-12 h-12 rounded-full bg-[#A78BFA] font-headline font-bold text-lg text-[#111827] flex items-center justify-center">
                        {review.name.charAt(0)}
                     </div>
                     <div>
                       <p className="text-[#111827] font-headline font-bold text-[0.95rem] tracking-wide">{review.name}</p>
                       <p className="text-[#64748B] font-body font-medium text-sm">{review.role}</p>
                     </div>
                  </div>
               </div>
             ))}
          </div>

        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-16 md:py-32 px-6 bg-[#F1F5F9] border-t border-[#e2e8f0]">
        <div className="max-w-4xl mx-auto">
          <div className="relative mb-14 block text-center">
             <h2 className="text-4xl md:text-[3rem] font-headline font-bold text-[#111827] tracking-tight text-center uppercase">PERGUNTAS FREQUENTES</h2>
             <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-24 h-1.5 bg-[#7C3AED] rounded-full"></div>
          </div>
          
          <div className="bg-white rounded-[1.5rem] p-6 md:p-10 shadow-sm border border-[#e2e8f0]">
             {faqs.map((faq, idx) => (
                <FAQItem key={idx} question={faq.q} answer={faq.a} />
             ))}
          </div>
          
          <div className="mt-16 text-center">
             <p className="text-[#64748B] font-body mb-6 font-medium text-lg">Ainda tem dúvidas? Fale com suporte humano.</p>
             <a href="https://wa.me/assessornico?text=Tenho%20d%C3%BAvidas" className="inline-flex items-center gap-3 bg-white text-[#111827] font-headline font-bold px-10 py-4 rounded-full hover:bg-[#e2e8f0] transition-colors border border-[#cbd5e1] shadow-sm tracking-wide text-sm">
               <span className="material-symbols-outlined text-[#22c55e] text-xl">support_agent</span>
               FALAR COM ATENDENTE
             </a>
          </div>
        </div>
      </section>

      {/* Footer Section */}
      <footer className="bg-[#0B1120] text-white pt-16 md:pt-32 pb-12 px-6 border-t border-[#1f2937] relative z-20">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-12 mb-20">
            {/* Brand Col */}
            <div className="lg:col-span-5 flex flex-col gap-8 text-left">
              <a href="/" className="flex items-center -ml-2">
                <Logo className="h-10 md:h-12" dark={true} />
              </a>
              <p className="text-[#94A3B8] font-body text-[1.05rem] leading-[1.75] max-w-sm">
                Transformando o seu WhatsApp no melhor assistente financeiro e pessoal que você já teve. 
                Inteligência, simplicidade e precisão ao seu alcance, 24 horas por dia.
              </p>
            </div>

            {/* Spacer */}
            <div className="hidden lg:block lg:col-span-1"></div>

            {/* Links Col 1 (Product) */}
            <div className="lg:col-span-3 text-left">
              <h4 className="font-headline font-bold text-white mb-10 text-lg uppercase tracking-widest border-l-2 border-[#7C3AED] pl-4">Produto</h4>
              <ul className="flex flex-col gap-5 text-[#94A3B8] font-body font-bold text-sm tracking-wide">
                <li><a href="#hero" className="hover:text-white hover:pl-2 transition-all duration-300">COMO FUNCIONA</a></li>
                <li><a href="#planos" className="hover:text-white hover:pl-2 transition-all duration-300">PLANOS E PREÇOS</a></li>
                <li><a href="#avaliacoes" className="hover:text-white hover:pl-2 transition-all duration-300">DEPOIMENTOS</a></li>
                <li><a href="#faq" className="hover:text-white hover:pl-2 transition-all duration-300">DÚVIDAS COMUNS</a></li>
              </ul>
            </div>

            {/* Links Col 2 (Suporte/Legal) */}
            <div className="lg:col-span-3 text-left">
              <h4 className="font-headline font-bold text-white mb-10 text-lg uppercase tracking-widest border-l-2 border-[#7C3AED] pl-4">Suporte</h4>
              <ul className="flex flex-col gap-5 text-[#94A3B8] font-body font-bold text-sm tracking-wide">
                <li><a href="#" className="hover:text-white hover:pl-2 transition-all duration-300">TERMOS DE USO</a></li>
                <li><a href="#" className="hover:text-white hover:pl-2 transition-all duration-300">PRIVACIDADE</a></li>
                <li><a href="#" className="hover:text-white hover:pl-2 transition-all duration-300">CONFIGURAÇÕES</a></li>
                <li><a href="#" className="hover:text-white hover:pl-2 transition-all duration-300">CENTRAL DE AJUDA</a></li>
              </ul>
            </div>
          </div>

          <div className="pt-12 border-t border-[#1f2937] flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-[#64748B] font-body text-sm">
              © 2026 Assessor Nico. Todos os direitos reservados.
            </p>
            <div className="flex gap-8 text-[#64748B] font-body text-sm">
              <a href="#" className="hover:text-white transition-colors">Política de Privacidade</a>
              <a href="#" className="hover:text-white transition-colors">Termos de Serviço</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
