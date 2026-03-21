import React, { useRef, useState } from 'react';
import ChatMockup from './ChatMockup';
import './index.css';

/* Avaliações Row 1 */
const reviewsTrack1 = [
  { t: "Nunca mais esqueci um boleto. O Nico é como ter um assistente pessoal que custa centavos.", a: "Mariana Costa", r: "Designer Freelancer" },
  { t: "O registro de gastos por voz mudou meu jogo. Agora sei exatamente pra onde meu dinheiro vai todo mês.", a: "Ricardo Silva", r: "Empreendedor" },
  { t: "Muito melhor do que preencher planilha! Mando um áudio rápido e meu fluxo de caixa está montado.", a: "João Pedro", r: "Dono de Agência" },
  { t: "Sou péssima em guardar notas fiscais físicas. Agora mando foto e ele computa o gasto perfeitamente.", a: "Camila Rocha", r: "Médica" },
  { t: "O fato de funcionar no WhatsApp que eu já abro 100x por dia faz toda a diferença do mundo na adesão.", a: "Fernando Albuquerque", r: "Especialista em TI" }
];

/* Avaliações Row 2 */
const reviewsTrack2 = [
  { t: "Ter um assessor 24h que me avisa do vencimento da fatura vale muito mais que o dobro do preço.", a: "Thiago Fernandes", r: "Desenvolvedor" },
  { t: "Antes eu terminava o mês no zero sem saber por quê. O Nico categorizou tudo sozinho pra mim.", a: "Letícia Santos", r: "Arquiteta" },
  { t: "Fiz uma viagem de 15 dias, ia relatando em áudio os passeios. Nico cuidou do balanço total.", a: "Marina Pelaes", r: "Nômade Digital" },
  { t: "Adeus GuiaBolso e planilhas complexas, a forma de uso mais natural possível é conversar no zap.", a: "André Matos", r: "Consultor" },
  { t: "Organizou minha vida de uma forma absurda. Sem fricção de baixar ou criar conta em app novo.", a: "Rafael Gomes", r: "Motorista Autônomo" }
];

/* Componente de Card de Review */
const ReviewCard = ({ review }) => (
  <div className="w-[320px] md:w-[400px] flex-shrink-0 p-7 rounded-[2rem] bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-colors duration-300 flex flex-col justify-between">
    <div>
      <div className="flex gap-1 text-[#8a4cfc] mb-4">
        {[...Array(5)].map((_, i) => (
          <span key={i} className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: '"FILL" 1' }}>star</span>
        ))}
      </div>
      <p className="text-white/80 text-[1.05rem] leading-relaxed mb-6 font-light">"{review.t}"</p>
    </div>
    <div className="flex items-center gap-3">
      <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-[#7C3AED]/20 to-[#bd9dff]/10 border border-white/5 flex items-center justify-center text-white/70 text-[0.9rem] font-bold uppercase shrink-0">
        {review.a.charAt(0)}
      </div>
      <div>
        <h4 className="text-white/90 text-sm font-bold tracking-tight">{review.a}</h4>
        <p className="text-white/40 text-xs font-medium">{review.r}</p>
      </div>
    </div>
  </div>
);

function App() {
  const heroRef = useRef(null);
  // const [tilt, setTilt] = useState({ x: 0, y: 0 }); // Removed useState for tilt

  const lastMoveRef = useRef(0);
  const handleMouseMove = (e) => {
    const now = Date.now();
    if (now - lastMoveRef.current < 16) return; // Limit to 60fps
    lastMoveRef.current = now;

    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Map mouse position to narrow tilt for stability
    const xPercent = x / rect.width;
    const yPercent = y / rect.height;
    const tiltX = (yPercent - 0.5) * -8; // Reduced range
    const tiltY = (xPercent - 0.5) * 8; 
    
    // Direct DOM update for high performance
    heroRef.current.style.setProperty('--tilt-x', `${tiltX}deg`);
    heroRef.current.style.setProperty('--tilt-y', `${tiltY}deg`);
  };
  
  const handleMouseLeave = () => {
    if (heroRef.current) {
      heroRef.current.style.setProperty('--tilt-x', `0deg`);
      heroRef.current.style.setProperty('--tilt-y', `0deg`);
    }
  };

  return (
    <div className="bg-background text-on-background font-body selection:bg-primary selection:text-on-primary">
      {/* Top Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-[#050505]/60 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="max-w-7xl mx-auto flex justify-between items-center px-4 md:px-12 py-4">
          <div className="flex items-center gap-1.5 font-headline text-xl">
            <span className="font-bold text-[#7C3AED] tracking-tight">Nico</span>
            <span className="font-normal text-[#64748B] tracking-wide">Assessor</span>
          </div>
          <div className="hidden md:flex items-center space-x-8 font-headline text-sm tracking-tight">
            <a className="text-neutral-400 hover:text-white transition-colors duration-300" href="#about">O que é</a>
            <a className="text-neutral-400 hover:text-white transition-colors duration-300" href="#benefits">Vantagens</a>
            <a className="text-neutral-400 hover:text-white transition-colors duration-300" href="#how-it-works">Como funciona</a>
          </div>
          <a className="bg-gradient-to-r from-primary to-primary-dim text-on-primary-fixed px-6 py-2.5 rounded-full text-sm font-semibold hover:scale-95 duration-200 ease-out transition-transform" href="https://wa.me/assessornico">
            Começar no WhatsApp
          </a>
        </div>
      </nav>

      {/* Hero Section */}
      <main 
        ref={heroRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative pt-24 pb-0 overflow-hidden min-h-screen flex items-center will-change-transform" 
        style={{ perspective: '1200px', '--tilt-x': '0deg', '--tilt-y': '0deg' }}
      >
        {/* === Gif Hero Background === */}
        <div className="absolute inset-0 w-full h-full z-0 bg-[#050505] overflow-hidden scale-110">
          <img 
            src="/hero-bg.gif" 
            className="w-full h-full object-cover object-top opacity-70" 
            alt="Hero background"
          />
          {/* atmospheric blend overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-[#050505] z-[1] pointer-events-none"></div>
        </div>
        
        {/* Content */}
        <div className="max-w-7xl mx-auto px-6 w-full relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 items-center gap-12 lg:gap-20">
            
            {/* Left: Copy with refined hierarchy and soft glass backing */}
            <div 
              style={{ transform: `rotateX(var(--tilt-x)) rotateY(var(--tilt-y))` }}
              className="space-y-7 max-w-2xl relative p-10 md:p-14 rounded-[3.5rem] bg-white/[0.01] backdrop-blur-2xl border border-white/[0.08] shadow-[0_20px_80px_rgba(0,0,0,0.4)] group overflow-hidden transition-transform duration-200 ease-out will-change-transform transform-gpu"
            >
              <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-[#7C3AED]/5 blur-3xl rounded-full pointer-events-none transition-all duration-700 group-hover:bg-[#7C3AED]/10"></div>

              
              <div className="relative z-10 w-full flex flex-col items-start gap-7">
                {/* Badge */}
                <div className="inline-flex items-center gap-2.5 bg-white/[0.04] rounded-full px-5 py-2">
                  <div className="relative">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <div className="absolute inset-0 w-2 h-2 bg-green-400 rounded-full animate-ping opacity-75"></div>
                  </div>
                  <span className="text-white/70 text-xs font-headline font-medium tracking-wide">Disponível 24h no WhatsApp</span>
                </div>

                  <h1 className="text-[2.8rem] md:text-[4.5rem] lg:text-[4.6rem] xl:text-[5rem] font-headline font-bold leading-[1.05] tracking-[-0.03em] text-white">
                    Sua vida<br />organizada<br />pelo
                    <span className="relative inline-block md:ml-3">
                      <span className="bg-gradient-to-r from-[#A78BFA] via-[#8B5CF6] to-[#7C3AED] bg-clip-text text-transparent"> WhatsApp.</span>
                    </span>
                  </h1>

                <p className="text-[1.05rem] md:text-lg text-white/80 max-w-md leading-[1.7] font-light">
                  Registre gastos, crie lembretes e organize sua rotina conversando naturalmente. Sem apps novos. Sem fricção.
                </p>

                <div className="flex flex-col sm:flex-row gap-3.5 pt-2 w-full sm:w-auto">
                  <a href="https://wa.me/assessornico" className="group relative inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-full text-[0.95rem] font-bold transition-all duration-300 overflow-hidden shadow-xl hover:shadow-[#7C3AED]/30 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]">
                    <div className="absolute inset-0 bg-gradient-to-r from-[#7C3AED] to-[#4C1D95] transition-opacity duration-300"></div>
                    
                    {/* Design Spell: Dynamic Shimmer Glow inside button */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-full overflow-hidden">
                       <div className="absolute -inset-x-full top-0 h-full bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12 translate-x-[-100%] group-hover:animate-[shimmer_1.5s_ease-out_infinite]"></div>
                       <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4/5 h-1/2 bg-[radial-gradient(circle,rgba(255,255,255,0.4)_0%,transparent_100%)] opacity-0 group-hover:opacity-100 group-hover:translate-y-1 transition-all duration-500 ease-out"></div>
                    </div>

                    <span className="relative z-10 text-white group-hover:drop-shadow-md">Começar no WhatsApp</span>
                    <span className="relative z-10 material-symbols-outlined text-white/90 text-lg group-hover:translate-x-1.5 group-hover:scale-110 transition-transform duration-300">arrow_forward</span>
                  </a>
                  <a href="#how-it-works" className="relative inline-flex items-center justify-center px-7 py-3.5 rounded-full text-[0.95rem] font-medium text-white/60 border border-white/10 hover:bg-white/5 hover:text-white transition-all duration-300">
                    Como funciona
                  </a>
                </div>

                {/* Social proof line */}
                <div className="flex items-center gap-3 pt-3">
                  <div className="flex items-center">
                    <span className="material-symbols-outlined text-[#7C3AED] text-base" style={{ fontVariationSettings: '"FILL" 1' }}>star</span>
                    <span className="material-symbols-outlined text-[#7C3AED] text-base" style={{ fontVariationSettings: '"FILL" 1' }}>star</span>
                    <span className="material-symbols-outlined text-[#7C3AED] text-base" style={{ fontVariationSettings: '"FILL" 1' }}>star</span>
                    <span className="material-symbols-outlined text-[#7C3AED] text-base" style={{ fontVariationSettings: '"FILL" 1' }}>star</span>
                    <span className="material-symbols-outlined text-[#7C3AED] text-base" style={{ fontVariationSettings: '"FILL" 1' }}>star</span>
                  </div>
                  <span className="text-white/40 text-xs font-medium">Amado por +1.400 usuários</span>
                </div>
              </div>
            </div>

            {/* Right: Mockup with GPU acceleration */}
            <div 
              style={{ transform: `rotateX(var(--tilt-x)) rotateY(var(--tilt-y))` }}
              className="hidden lg:flex justify-center items-center lg:justify-end transition-transform duration-200 ease-out will-change-transform transform-gpu"
            >


              {/* Phone wrapper with gradient border and Design Spell: Interactive 3D Tilt */}
              <div 
                className="relative p-[2px] rounded-[3rem] bg-gradient-to-b from-white/20 via-white/5 to-transparent transition-transform duration-500 ease-out will-change-transform transform-gpu"
                style={{ transform: `rotateX(var(--tilt-x)) rotateY(var(--tilt-y))` }}
              >
                <ChatMockup />
              </div>

              {/* Reflection line at bottom */}
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-[60%] h-[1px] bg-gradient-to-r from-transparent via-[#7C3AED]/30 to-transparent"></div>
            </div>
          </div>
        </div>

        {/* Bottom fade into next section */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none z-[2]"></div>
      </main>

      {/* Infinite Scroll Marquee - Design Polish */}
      <div className="relative py-8 overflow-hidden border-y border-white/[0.04] bg-[#050505]/60 backdrop-blur-md">
        <div className="marquee-track">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="marquee-content items-center">
              {[
                { icon: 'payments', text: 'Controle de Gastos' },
                { icon: 'event_available', text: 'Agenda Inteligente' },
                { icon: 'psychology', text: 'Memória Infinita' },
                { icon: 'notifications_active', text: 'Lembretes Automáticos' },
                { icon: 'bar_chart', text: 'Relatórios Semanais' },
                { icon: 'lock', text: 'Criptografia E2E' },
                { icon: 'chat', text: 'Via WhatsApp' },
                { icon: 'speed', text: 'Resposta Instantânea' },
              ].map((item, j) => (
                <div key={j} className="flex items-center gap-3 px-10 whitespace-nowrap group">
                  <span className="material-symbols-outlined text-[#7C3AED] text-xl opacity-60 group-hover:opacity-100 transition-opacity">{item.icon}</span>
                  <span className="text-white/30 text-xs font-headline font-bold uppercase tracking-[0.2em] group-hover:text-white/60 transition-colors">{item.text}</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-white/10 mx-6 group-hover:bg-[#7C3AED]/40 transition-colors"></div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Features Grid - Performance Optimized */}
      <section className="py-24 relative overflow-hidden" id="benefits" style={{ contentVisibility: 'auto', containIntrinsicSize: '0 800px' }}>
        {/* Glow background for benefits */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#7C3AED]/10 blur-[120px] rounded-full pointer-events-none z-[-1]"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#7C3AED]/10 blur-[120px] rounded-full pointer-events-none"></div>

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="mb-20 text-center">
            <span className="text-[#7C3AED] font-headline font-bold tracking-[0.2em] text-xs uppercase">Ecossistema Assessor Nico</span>
            <h2 className="text-4xl md:text-5xl lg:text-5.5xl font-headline font-bold text-white mt-4 tracking-tight">Tudo o que você precisa,<br/><span className="bg-gradient-to-r from-[#A78BFA] to-[#7C3AED] bg-clip-text text-transparent">em um só lugar.</span></h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Gastos */}
            <div className="glass-card rounded-2xl p-8 hover:bg-white/5 transition-all duration-300 group">
              <div className="bg-primary/10 w-12 h-12 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-primary text-2xl">payments</span>
              </div>
              <h3 className="text-xl font-headline font-bold text-white mb-3">Gastos</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">Registre despesas instantaneamente por texto ou voz. O Nico categoriza tudo automaticamente.</p>
            </div>
            {/* Compromissos */}
            <div className="glass-card rounded-2xl p-8 hover:bg-white/5 transition-all duration-300 group">
              <div className="bg-primary/10 w-12 h-12 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-primary text-2xl">event_available</span>
              </div>
              <h3 className="text-xl font-headline font-bold text-white mb-3">Compromissos</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">Gerencie sua agenda sem sair do chat. O Nico organiza reuniões e compromissos com facilidade.</p>
            </div>
            {/* Memória */}
            <div className="glass-card rounded-2xl p-8 hover:bg-white/5 transition-all duration-300 group">
              <div className="bg-primary/10 w-12 h-12 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-primary text-2xl">psychology</span>
              </div>
              <h3 className="text-xl font-headline font-bold text-white mb-3">Memória</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">Consulte informações passadas a qualquer momento. O Nico lembra de cada detalhe compartilhado.</p>
            </div>
            {/* Orçamento Inteligente */}
            <div className="glass-card rounded-2xl p-8 hover:bg-white/5 transition-all duration-300 group">
              <div className="bg-primary/10 w-12 h-12 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-primary text-2xl">track_changes</span>
              </div>
              <h3 className="text-xl font-headline font-bold text-white mb-3">Orçamento Inteligente</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">Defina metas para seus gastos e receba alertas em tempo real se estiver chegando perto do seu limite.</p>
            </div>
            {/* Lembretes */}
            <div className="glass-card rounded-2xl p-8 hover:bg-white/5 transition-all duration-300 group">
              <div className="bg-primary/10 w-12 h-12 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-primary text-2xl">notifications_active</span>
              </div>
              <h3 className="text-xl font-headline font-bold text-white mb-3">Lembretes</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">Nunca mais esqueça um boleto ou tarefa importante. Avisos pontuais no horário solicitado.</p>
            </div>
            {/* Integração WhatsApp */}
            <div className="glass-card rounded-2xl p-8 hover:bg-white/5 transition-all duration-300 group">
              <div className="bg-primary/10 w-12 h-12 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-primary text-2xl">chat</span>
              </div>
              <h3 className="text-xl font-headline font-bold text-white mb-3">Integração WhatsApp</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">Simplicidade total. Sem aplicativos novos para baixar, use a interface que você já domina.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works - Optimized */}
      <section className="py-24 relative overflow-hidden" id="how-it-works" style={{ contentVisibility: 'auto', containIntrinsicSize: '0 800px' }}>
        {/* Parallax-like glow */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#7C3AED]/3 blur-[100px] rounded-full pointer-events-none translate-x-1/3"></div>
        
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="max-w-2xl mx-auto p-12 rounded-[2.5rem] glass-premium text-center mb-24 relative overflow-hidden border border-white/10">
             <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-[#7C3AED]/5 blur-3xl rounded-full"></div>
             <h2 className="text-4xl md:text-5xl font-headline font-bold text-white relative z-10 tracking-tight">Três passos para a <br/><span className="bg-gradient-to-r from-[#A78BFA] to-[#7C3AED] bg-clip-text text-transparent">liberdade.</span></h2>
             <p className="text-white/40 mt-6 text-lg relative z-10 font-light">Simplicidade extrema é o nosso lema. Do WhatsApp direto para o seu controle total.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            {/* Step 1 */}
            <div className="relative z-10 flex flex-col items-center text-center group">
              <div className="w-24 h-24 rounded-3xl glass-card flex items-center justify-center mb-8 group-hover:scale-110 group-hover:bg-[#7C3AED]/10 group-hover:border-[#7C3AED]/30 transition-all duration-500 border border-white/5 shadow-2xl">
                <span className="text-3xl font-headline font-bold text-[#A78BFA]">01</span>
              </div>
              <h3 className="text-2xl font-headline font-bold text-white mb-3">Envie uma mensagem</h3>
              <p className="text-white/40 leading-relaxed font-light">Como se estivesse falando com um amigo no WhatsApp. Sem comandos difíceis.</p>
            </div>
            {/* Step 2 */}
            <div className="relative z-10 flex flex-col items-center text-center group">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#8a4cfc] to-[#6d28d9] flex items-center justify-center mb-8 group-hover:scale-110 shadow-[0_15px_40px_rgba(138,76,252,0.3)] transition-all duration-500">
                <span className="text-3xl font-headline font-bold text-white">02</span>
              </div>
              <h3 className="text-2xl font-headline font-bold text-white mb-3">O Nico processa</h3>
              <p className="text-white/40 leading-relaxed font-light">Nossa tecnologia interpreta o contexto, salva no banco e responde em segundos.</p>
            </div>
            {/* Step 3 */}
            <div className="relative z-10 flex flex-col items-center text-center group">
              <div className="w-24 h-24 rounded-3xl glass-card flex items-center justify-center mb-8 group-hover:scale-110 group-hover:bg-[#8a4cfc]/10 group-hover:border-[#8a4cfc]/30 transition-all duration-500 border border-white/5 shadow-2xl">
                <span className="text-3xl font-headline font-bold text-[#bd9dff]">03</span>
              </div>
              <h3 className="text-2xl font-headline font-bold text-white mb-3">Vida sob controle</h3>
              <p className="text-white/40 leading-relaxed font-light">Pronto. Informação registrada, lembrete agendado. Você livre para o que importa.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial Section - Optimized */}
      <section className="py-24 relative overflow-hidden bg-[#050505] border-y border-white/5" style={{ contentVisibility: 'auto', containIntrinsicSize: '0 1000px' }}>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-[radial-gradient(ellipse_at_top,rgba(138,76,252,0.06),transparent_60%)] pointer-events-none"></div>
        
        <div className="max-w-7xl mx-auto px-6 mb-16 relative z-10 text-center">
          <h2 className="text-4xl md:text-5xl font-headline font-bold text-white leading-tight mb-4 tracking-tight">Quem usa o Nico, <span className="bg-gradient-to-r from-[#bd9dff] via-[#a87cff] to-[#8a4cfc] bg-clip-text text-transparent">não volta atrás.</span></h2>
          <p className="text-white/50 text-lg max-w-2xl mx-auto font-light">Milhares de rotinas financeiras destravadas pelo WhatsApp, num piscar de olhos de quem odeia planilhas.</p>
        </div>

        {/* Marquee Tracks Container */}
        <div className="flex flex-col gap-6 relative z-10">
           {/* Fade overlay on edges to blend with background */}
           <div className="absolute inset-y-0 left-0 w-16 md:w-64 bg-gradient-to-r from-background to-transparent z-20 pointer-events-none"></div>
           <div className="absolute inset-y-0 right-0 w-16 md:w-64 bg-gradient-to-l from-background to-transparent z-20 pointer-events-none"></div>

           {/* Track 1: Move Left */}
           <div className="flex overflow-hidden group">
              <div className="marquee-content gap-6 px-3" style={{ animation: 'marqueeScroll 45s linear infinite' }}>
                {reviewsTrack1.map((r, i) => <ReviewCard key={i} review={r} />)}
                {reviewsTrack1.map((r, i) => <ReviewCard key={`dup-${i}`} review={r} />)}
              </div>
           </div>

           {/* Track 2: Move Right (using reverse direction) */}
           <div className="flex overflow-hidden group">
              <div className="marquee-content gap-6 px-3" style={{ animation: 'marqueeScroll 55s linear infinite reverse' }}>
                {reviewsTrack2.map((r, i) => <ReviewCard key={i} review={r} />)}
                {reviewsTrack2.map((r, i) => <ReviewCard key={`dup-${i}`} review={r} />)}
              </div>
           </div>
        </div>
      </section>

      {/* Pricing / Plan Section - Restructured & High Conversion */}
      <section className="min-h-screen py-32 relative bg-[#050505] overflow-hidden" id="plano">
        {/* === Mirror GIF Background for Pricing === */}
        <div className="absolute inset-0 w-full h-full z-0 bg-[#050505] overflow-hidden">
          <img 
            src="/hero-bg.gif" 
            className="w-full h-full object-cover object-bottom opacity-40" 
            alt="Pricing background"
          />
          {/* subtle masking to blend from top to bottom */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-transparent to-[#050505]/40 pointer-events-none"></div>
        </div>
        
        <div className="max-w-7xl mx-auto px-6 relative z-10 flex flex-col items-center">
          {/* New Focused Header */}
          <div className="text-center mb-20 max-w-2xl">
            <h2 className="text-4xl md:text-6xl font-headline font-bold text-white mb-6 tracking-tight">
              Um pequeno investimento, <br/>
              <span className="bg-gradient-to-r from-[#A78BFA] via-[#8B5CF6] to-[#7C3AED] bg-clip-text text-transparent">retorno infinito.</span>
            </h2>
            <p className="text-white/40 text-lg md:text-xl font-light">
              Escolha o plano que melhor se adapta à sua jornada financeira.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full max-w-5xl">
            {/* Plan 1: Beta/Limited (Comparison anchor) */}
            <div className="p-8 md:p-12 rounded-[3.5rem] bg-white/[0.02] border border-white/5 flex flex-col justify-between group hover:bg-white/[0.04] transition-all duration-500">
              <div>
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-headline font-bold text-white/60">Versão Beta</h3>
                  <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/40 text-[10px] font-bold uppercase tracking-widest">Limitado</span>
                </div>
                <div className="mb-10">
                  <span className="text-4xl font-headline font-bold text-white/40 text-strikethrough">Grátis</span>
                </div>
                <ul className="space-y-4 text-white/40 mb-10">
                  <li className="flex items-center gap-3 text-sm">
                    <span className="material-symbols-outlined text-sm opacity-50">check</span>
                    Até 5 registros por dia
                  </li>
                  <li className="flex items-center gap-3 text-sm">
                    <span className="material-symbols-outlined text-sm opacity-50">check</span>
                    Lembretes simples
                  </li>
                  <li className="flex items-center gap-3 text-sm line-through decoration-[#7C3AED]/30">
                    Sem leitura de áudio/foto
                  </li>
                  <li className="flex items-center gap-3 text-sm line-through decoration-[#7C3AED]/30">
                    Sem relatórios semanais
                  </li>
                </ul>
              </div>
              <button className="w-full py-4 rounded-2xl border border-white/10 text-white/40 font-bold text-sm cursor-not-allowed">
                Vagas Esgotadas
              </button>
            </div>

            {/* Plan 2: Assessor Premium (The Hero) */}
            <div className="relative p-[1.5px] rounded-[3.5rem] bg-gradient-to-b from-[#7C3AED] via-white/10 to-transparent shadow-[0_20px_80px_rgba(124,58,237,0.15)] transform lg:scale-105">
              <div className="h-full bg-[#050505] backdrop-blur-3xl rounded-[3.4rem] p-8 md:p-12 relative overflow-hidden flex flex-col justify-between">
                {/* Internal Glow */}
                <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-[#8a4cfc]/5 blur-3xl rounded-full"></div>
                
                <div>
                  <div className="flex items-center justify-between mb-8 relative z-10">
                    <h3 className="text-3xl font-headline font-bold text-white">Assessor Premium</h3>
                    <span className="px-3 py-1 rounded-full bg-[#7C3AED]/20 border border-[#7C3AED]/40 text-[#A78BFA] text-[10px] font-bold uppercase tracking-widest">Mais Popular</span>
                  </div>
                  <div className="mb-10 relative z-10 flex items-baseline gap-2">
                    <span className="text-6xl font-headline font-bold text-white tracking-tighter">R$ 9,90</span>
                    <span className="text-white/40 text-lg">/mês</span>
                  </div>
                  <ul className="space-y-5 text-white/80 mb-12 relative z-10">
                    {[
                      { text: "Registros Ilimitados", highlight: true },
                      { text: "Leitura de áudios e imagens", highlight: true },
                      { text: "Avisos automáticos de boletos", highlight: false },
                      { text: "Relatórios mensais de fluxo", highlight: false },
                      { text: "Suporte VIP 24/7", highlight: false }
                    ].map((item, i) => (
                      <li key={i} className="flex items-center gap-3 font-light">
                        <span className="material-symbols-outlined text-[#A78BFA] text-xl" style={{ fontVariationSettings: '"FILL" 1' }}>check_circle</span>
                        {item.text}
                      </li>
                    ))}
                  </ul>
                </div>
                
                <a href="https://wa.me/assessornico" className="relative z-10 w-full flex items-center justify-center py-5 rounded-2xl font-bold text-white bg-gradient-to-r from-[#7C3AED] to-[#4C1D95] shadow-[0_10px_30px_rgba(124,58,237,0.3)] hover:shadow-[0_15px_40px_rgba(124,58,237,0.4)] hover:-translate-y-1 transition-all duration-300">
                  Começar agora
                </a>
              </div>
            </div>
          </div>

          {/* Trust Badges */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 mt-24 w-full max-w-4xl border-t border-white/5 pt-12 opacity-50">
             <div className="flex flex-col items-center gap-2 text-center text-white/60">
                <span className="material-symbols-outlined text-2xl">verified_user</span>
                <span className="text-[10px] font-bold uppercase tracking-widest">Segurança Bancária</span>
             </div>
             <div className="flex flex-col items-center gap-2 text-center text-white/60">
                <span className="material-symbols-outlined text-2xl">event_repeat</span>
                <span className="text-[10px] font-bold uppercase tracking-widest">Cancele quando quiser</span>
             </div>
             <div className="flex flex-col items-center gap-2 text-center text-white/60">
                <span className="material-symbols-outlined text-2xl">support_agent</span>
                <span className="text-[10px] font-bold uppercase tracking-widest">Suporte 24h</span>
             </div>
             <div className="flex flex-col items-center gap-2 text-center text-white/60">
                <span className="material-symbols-outlined text-2xl">history</span>
                <span className="text-[10px] font-bold uppercase tracking-widest">Garantia 7 dias</span>
             </div>
          </div>
        </div>
      </section>

      {/* Footer - Glass Harmony */}
      <footer className="relative py-20 px-6 border-t border-white/5 bg-[#050505]/80 backdrop-blur-3xl overflow-hidden">
        {/* Subtle glow coming from the top into the footer */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[1px] bg-gradient-to-r from-transparent via-[#8a4cfc]/40 to-transparent"></div>
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-12">
            <div className="flex flex-col items-start">
              <span className="text-2xl font-bold text-white mb-3 block font-headline tracking-tighter">Assessor Nico</span>
              <p className="font-body text-sm text-white/30 max-w-sm">Elevando sua gestão financeira através da Inteligência Artificial humana e direta no seu WhatsApp.</p>
            </div>
            
            <div className="flex flex-wrap gap-12 text-sm">
              <div className="flex flex-col gap-4">
                <span className="text-white font-bold mb-2">Produto</span>
                <a className="text-white/40 hover:text-[#bd9dff] transition-colors" href="#benefits">Vantagens</a>
                <a className="text-white/40 hover:text-[#bd9dff] transition-colors" href="#how-it-works">Como funciona</a>
                <a className="text-white/40 hover:text-[#bd9dff] transition-colors" href="#plano">Plano Premium</a>
              </div>
              <div className="flex flex-col gap-4">
                <span className="text-white font-bold mb-2">Legal</span>
                <a className="text-white/40 hover:text-[#bd9dff] transition-colors" href="#">Privacidade</a>
                <a className="text-white/40 hover:text-[#bd9dff] transition-colors" href="#">Termos de Uso</a>
              </div>
            </div>

            <div className="flex flex-col items-center md:items-end gap-6">
              <div className="flex gap-4">
                <a className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:border-[#8a4cfc] hover:text-[#bd9dff] hover:bg-[#8a4cfc]/10 transition-all duration-300" href="#">
                  <span className="material-symbols-outlined text-xl">share</span>
                </a>
                <a className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:border-[#8a4cfc] hover:text-[#bd9dff] hover:bg-[#8a4cfc]/10 transition-all duration-300" href="#">
                  <span className="material-symbols-outlined text-xl">alternate_email</span>
                </a>
              </div>
            </div>
          </div>
          
          <div className="mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
             <p className="text-white/20 text-xs">© 2024 Assessor Nico. Todos os direitos reservados.</p>
             <p className="text-white/20 text-xs font-light">Design by Antigravity AI</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
