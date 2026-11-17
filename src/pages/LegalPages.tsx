import React from 'react';
import { ArrowLeft, BookOpen, Compass, Lock, Scale, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';

function PolicySubNav({ active }: { active: 'about' | 'principles' | 'terms' | 'privacy' }) {
  const { t, navigate } = useApp();
  const links = [
    { id: 'about' as const, label: t.legal.aboutLink, path: '/about' },
    { id: 'principles' as const, label: t.legal.principlesLink, path: '/editorial-principles' },
    { id: 'terms' as const, label: t.legal.termsLink, path: '/terms' },
    { id: 'privacy' as const, label: t.legal.privacyLink, path: '/privacy' },
  ];

  return (
    <nav
      aria-label="Platform policy navigation"
      className="mt-6 flex flex-wrap items-center gap-2 border-b border-[#1D2823] pb-4"
    >
      {links.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => navigate(item.path)}
          className={`rounded-md px-3.5 py-2 text-xs font-medium transition-colors ${
            active === item.id
              ? 'bg-[#B89B63] text-[#090D0C]'
              : 'border border-[#26352E] bg-[#101715] text-[#A9AEA7] hover:border-[#B89B63]/60 hover:text-[#E9E7DF]'
          }`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export function AboutPage() {
  const { lang, t, navigate } = useApp();
  const isTr = lang === 'tr';

  return (
    <main className="mx-auto max-w-[960px] px-6 py-12">
      <button
        type="button"
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-2 text-xs font-medium text-[#A9AEA7] hover:text-[#E9E7DF]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>{t.nav.home}</span>
      </button>

      <header className="mt-6 border-b border-[#1D2823] pb-6">
        <p className="font-mono text-xs tracking-[0.2em] text-[#B89B63]">
          SENTARIKA ARCHIVE · {t.slogan}
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-[#E9E7DF] sm:text-4xl">
          {t.legal.aboutTitle}
        </h1>
        <p className="mt-2 font-mono text-xs text-[#8D968F]">
          {t.landing.heroTagline} · {t.legal.lastUpdated}
        </p>
      </header>

      <PolicySubNav active="about" />

      <div className="mt-8 space-y-10 text-sm leading-[1.85] text-[#C8CEC7]">
        <section id="about" className="rounded-lg border border-[#223029] bg-[#101715] p-6 sm:p-8">
          <div className="flex items-center gap-2.5 text-[#B89B63]">
            <BookOpen className="h-4 w-4 shrink-0" />
            <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
              {isTr ? '1. Hakkımızda — Temel Kimlik' : '1. About Us — Core Identity'}
            </h2>
          </div>
          <p className="mt-4">
            {isTr
              ? 'SENTARIKA ARCHIVE, bilgiye erişimi, bilginin korunmasını, belgelenmesini, sınıflandırılmasını ve araştırılmasını amaçlayan bağımsız bir dijital arşivdir.'
              : 'SENTARIKA ARCHIVE is an independent digital archive dedicated to enabling access to information and preserving, documenting, classifying, and researching primary records.'}
          </p>
          <p className="mt-3">
            {isTr
              ? 'Platformun temel yaklaşımı, bilgiyi belirli bir siyasi, ideolojik, toplumsal veya kişisel görüşe göre değerlendirmemektir. Tartışmalı olaylar, tarihsel belgeler, araştırma materyalleri ve farklı görüşler yalnızca konunun niteliği nedeniyle otomatik olarak araştırma kapsamının dışında bırakılmaz; amaç bilgiyi tek bir anlatıya indirgemek değil, farklı kaynakların incelenebilmesine imkân sağlamaktır.'
              : 'Our foundational approach does not evaluate information through any political, ideological, social, or personal lens. Controversial historical events, sensitive debates, primary research materials, and differing perspectives are not excluded from historical examination merely because of their subject matter. Our goal is not to force knowledge into a single narrative, but to enable comparative inspection across distinct sources.'}
          </p>
        </section>

        <section id="philosophy">
          <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
            {isTr ? '2. Temel Felsefe' : '2. Core Philosophy'}
          </h2>
          <ol className="mt-4 divide-y divide-[#1D2823] rounded-lg border border-[#223029] bg-[#0D1311] px-6">
            {t.landing.axioms.map((axiom, idx) => (
              <li key={axiom} className="flex items-baseline gap-5 py-4">
                <span className="font-mono text-xs text-[#B89B63] tabular-nums">0{idx + 1}</span>
                <span className="font-display text-base sm:text-lg text-[#E9E7DF]">{axiom}</span>
              </li>
            ))}
          </ol>
        </section>

        <section id="purpose" className="border-t border-[#1D2823] pt-8">
          <div className="flex items-center gap-2.5 text-[#557B67]">
            <Compass className="h-4 w-4 shrink-0" />
            <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
              {isTr ? '3. Amacımız' : '3. Our Purpose'}
            </h2>
          </div>
          <p className="mt-3">
            {isTr
              ? 'SENTARIKA ARCHIVE, farklı alanlardaki bilgilerin korunmasını ve yetkili araştırmacılar için erişilebilir kalmasını amaçlar. Tarih, siyaset, bilim, teknoloji, ekonomi, kültür, internet tarihi, toplumsal olaylar, suç tarihi, savaşlar, propaganda, sansür ve diğer araştırma konuları platformun bilgi kapsamına dahildir.'
              : 'SENTARIKA ARCHIVE aims to preserve knowledge across diverse fields and keep historical records accessible for study. Its scope includes history, politics, science, technology, economy, culture, internet history, social movements, crime history, wars, propaganda, censorship, and broader archival research.'}
          </p>
          <p className="mt-3">
            {isTr
              ? 'Platform, bir konunun tartışmalı olması nedeniyle araştırma değerini yok saymaz; bilginin kaynağını, tarihini ve bağlamını mümkün olduğunca korumayı hedefler.'
              : 'We do not dismiss research value simply because a topic is contested; instead, we strive to preserve provenance, dates, and historical context alongside each archived entry.'}
          </p>
        </section>

        <section id="independence" className="border-t border-[#1D2823] pt-8">
          <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
            {isTr ? '4. Arşiv Bağımsızlığı' : '4. Archival Independence'}
          </h2>
          <p className="mt-3">
            {isTr
              ? 'Platformun amacı tek bir resmi veya gayriresmi anlatıyı dayatmak değildir. Farklı kaynakların, tarihsel yorumların ve araştırma materyallerinin karşılaştırılabilmesini destekler. Her kaydın kaynak bilgisi, tarihi, açıklaması ve doğrulanabilirlik durumu mümkün olan en yüksek tutarlılıkla korunur.'
              : 'SENTARIKA ARCHIVE exists to support side-by-side comparison of competing sources, historical interpretations, and primary records rather than enforcing a single narrative. Provenance, publication dates, contextual notes, and verification status are preserved wherever available.'}
          </p>
        </section>
      </div>
    </main>
  );
}

export function EditorialPrinciplesPage() {
  const { lang, t, navigate } = useApp();
  const isTr = lang === 'tr';

  return (
    <main className="mx-auto max-w-[960px] px-6 py-12">
      <button
        type="button"
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-2 text-xs font-medium text-[#A9AEA7] hover:text-[#E9E7DF]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>{t.nav.home}</span>
      </button>

      <header className="mt-6 border-b border-[#1D2823] pb-6">
        <p className="font-mono text-xs tracking-[0.2em] text-[#B89B63]">
          SENTARIKA ARCHIVE · {t.slogan}
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-[#E9E7DF] sm:text-4xl">
          {t.legal.principlesTitle}
        </h1>
        <p className="mt-2 font-mono text-xs text-[#8D968F]">{t.legal.lastUpdated}</p>
      </header>

      <PolicySubNav active="principles" />

      <div className="mt-8 space-y-8 text-sm leading-[1.85] text-[#C8CEC7]">
        <section className="rounded-lg border border-[#223029] bg-[#101715] p-6 sm:p-8">
          <div className="flex items-center gap-2.5 text-[#B89B63]">
            <Scale className="h-4 w-4 shrink-0" />
            <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
              {isTr ? '1. Tarafsızlık ve Bağlamsal Doğruluk' : '1. Neutrality & Contextual Preservation'}
            </h2>
          </div>
          <ul className="mt-4 list-disc space-y-3 pl-5">
            <li>
              {isTr
                ? 'SENTARIKA ARCHIVE herhangi bir siyasi parti, devlet, ideoloji, kuruluş veya hareketin temsilcisi değildir.'
                : 'SENTARIKA ARCHIVE does not represent any political party, state, ideology, organization, or movement.'}
            </li>
            <li>
              {isTr
                ? 'Bir kaydın arşivde yer alması, platformun o kayıtta ifade edilen görüşleri benimsediğini veya desteklediğini göstermez.'
                : 'Inclusion of a record in the archive does not mean the platform endorses or promotes the claims expressed inside that record.'}
            </li>
            <li>
              {isTr
                ? 'Bir içeriğin arşivlenmesi, içeriğin mutlak doğruluğunun garanti edildiği anlamına gelmez.'
                : 'Archiving a document does not guarantee factual infallibility; primary provenance and verification metadata are presented alongside the record.'}
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
            {isTr ? '2. Kaynak Ayrımı ve Doğrulama Şeffaflığı' : '2. Source Attribution & Separation'}
          </h2>
          <p className="mt-3">
            {isTr
              ? 'Orijinal belge, kaynak bilgisi, arşivci notu ve kamuya açık bağlamsal özet birbirinden ayrı alanlarda sunulur. Her arşiv kaydında mümkün olan her durumda kaynak atfı (Provenance / Source Attribution) açıkça belirtilir.'
              : 'Primary documents, provenance citations, archival notes, and descriptive summaries are explicitly separated. Source attribution metadata is recorded wherever available so researchers can verify origins independently.'}
          </p>
        </section>

        <section className="border-t border-[#1D2823] pt-6">
          <h2 className="font-display text-2xl font-semibold text-[#E9E7DF]">
            {isTr ? '3. İlkeler Dizini' : '3. Guiding Axioms'}
          </h2>
          <ol className="mt-4 divide-y divide-[#1D2823] rounded-lg border border-[#223029] bg-[#0D1311] px-6">
            {t.landing.axioms.map((axiom, idx) => (
              <li key={axiom} className="flex items-baseline gap-5 py-4">
                <span className="font-mono text-xs text-[#B89B63] tabular-nums">0{idx + 1}</span>
                <span className="font-display text-base text-[#E9E7DF]">{axiom}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}


export function TermsPage() {
  const { lang, t, navigate } = useApp();
  const isTr = lang === 'tr';

  return (
    <main className="mx-auto max-w-[960px] px-6 py-12">
      <button
        type="button"
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-2 text-xs font-medium text-[#A9AEA7] hover:text-[#E9E7DF]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>{t.nav.home}</span>
      </button>

      <header className="mt-6 border-b border-[#1D2823] pb-6">
        <p className="font-mono text-xs tracking-wider text-[#B89B63]">
          SENTARIKA ARCHIVE · {t.slogan}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-[#E9E7DF] sm:text-4xl">
          {t.legal.termsTitle}
        </h1>
        <p className="mt-2 font-mono text-xs text-[#8D968F]">{t.legal.lastUpdated}</p>
      </header>

      <PolicySubNav active="terms" />

      <div className="mt-8 space-y-8 text-sm leading-[1.85] text-[#C8CEC7]">
        <section className="rounded-lg border border-[#223029] bg-[#101715] p-6">
          <div className="flex items-center gap-2.5 text-[#B89B63]">
            <Lock className="h-4 w-4 shrink-0" />
            <h2 className="font-display text-xl font-semibold text-[#E9E7DF]">
              {isTr
                ? '1. Anahtar Tabanlı Kimlik ve Sıfır Kurtarma İlkesi'
                : '1. Key-Based Identity & Zero Recovery Policy'}
            </h2>
          </div>
          <p className="mt-3">
            {isTr
              ? 'Sentarika Archive yalnızca benzersiz kullanıcı adı ve sunucu tarafında kriptografik olarak üretilen 30 karakterli Erişim Anahtarı ile çalışır. Sistem e-posta, parola, SMS veya sosyal oturum bilgisi toplamaz. Erişim anahtarının yalnızca HMAC-SHA256 hash değeri saklanır; bu nedenle kayıp anahtarlar kesinlikle kurtarılamaz, sıfırlanamaz veya yeniden gösterilemez.'
              : 'Sentarika Archive operates exclusively using a unique username and a 30-character Access Key generated via backend CSPRNG. No email addresses, passwords, SMS numbers, or social logins are collected. Only an HMAC-SHA256 hash of your key is stored; lost keys can never be recovered, reset, or revealed.'}
          </p>
        </section>

        <section>
          <div className="flex items-center gap-2.5 text-[#557B67]">
            <Scale className="h-4 w-4 shrink-0" />
            <h2 className="font-display text-xl font-semibold text-[#E9E7DF]">
              {isTr
                ? '2. Kullanıcı Sorumluluğu ve Hukuki Bilgilendirme'
                : '2. User Responsibility & Legal Notice'}
            </h2>
          </div>
          <p className="mt-3">
            {isTr
              ? 'SENTARIKA ARCHIVE bilgiye erişim ve arşivleme altyapısı sunar. Kullanıcılar eriştikleri bilgileri nasıl değerlendirecekleri, yorumlayacakları ve kullanacakları ile kendi faaliyetlerinin tüm sonuçları konusunda bizzat sorumludur. Bir kullanıcının bağımsız eylemi, paylaşımı veya yorumu otomatik olarak platformun görüşü ya da onayı sayılamaz.'
              : 'SENTARIKA ARCHIVE provides technical access and archival preservation infrastructure. Users are individually responsible for how they evaluate, interpret, or act upon information accessed through the repository. Any independent action, statement, or contribution by a user does not constitute platform endorsement.'}
          </p>
          <p className="mt-3">
            {isTr
              ? 'Kullanıcılar yürürlükteki mevzuata ve üçüncü kişilerin haklarına uymakla yükümlüdür. Bu ilkeler platformun veya kullanıcıların kanunen doğabilecek sorumluluklarını ortadan kaldıran mutlak bir hukuki muafiyet iddiası niteliği taşımaz.'
              : 'All users must comply with applicable laws and third-party legal rights. Nothing in these editorial or archival principles constitutes, nor is claimed as, absolute legal immunity from statutory obligations applicable to users or platform operators.'}
          </p>
        </section>

        <section>
          <div className="flex items-center gap-2.5 text-[#E58A82]">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <h2 className="font-display text-xl font-semibold text-[#E9E7DF]">
              {isTr
                ? '3. Kabul Edilebilir Kullanım ve Güvenlik Kısıtları'
                : '3. Acceptable Use & Platform Safety Boundaries'}
            </h2>
          </div>
          <p className="mt-3">
            {isTr
              ? 'Arşiv bütünlüğü ve yasal uyumluluk ilkeleri doğrultusunda kötü amaçlı yazılımların, aktif çalıştırılabilir betiklerin, yetkisiz kişisel verilerin, telif veya gizlilik haklarını ihlal eden unsurların ve yasa dışı materyallerin sisteme yüklenmesi veya dağıtılması yasaktır.'
              : 'Uploading or distributing malware, active executable scripts, unauthorized private personal data, infringing copyrighted works, or illegal content is strictly prohibited across the repository.'}
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-[#E9E7DF]">
            {isTr ? '4. Rütbeler, Roller ve Erişim Kuralları' : '4. Ranks, Custom Roles & Access Rules'}
          </h2>
          <p className="mt-3">
            {isTr
              ? 'Yeni kayıt olan her hesap ÜYE (UYE) rütbesiyle başlar. Kategori, alt kategori ve arşiv erişimleri Varsayılan Red (Default Deny) kuralıyla hesaplanır; yönetici ekibi özel roller, istisnalar, askıya alma veya kalıcı yasaklama uygulayabilir.'
              : 'Every new member registration strictly starts at rank Member (UYE). Access across categories, subcategories, and archives follows Default Deny resolution; administrators may manage custom roles, overrides, suspensions, or bans.'}
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-[#E9E7DF]">
            {isTr ? '5. İçerik Bildirimi ve Moderasyon' : '5. Content Reporting & Moderation'}
          </h2>
          <p className="mt-3">
            {isTr
              ? 'Üyeler riskli veya mevzuata aykırı buldukları arşiv kayıtlarını İçeriği Bildir aracı üzerinden yönetime iletebilir. Moderasyon kararları gerekçesiyle birlikte değişmez denetim zincirine işlenir.'
              : 'Members may flag questionable or unlawful records via the Report Content workflow. All moderation reviews, visibility restrictions, and removals require documented justification in the immutable audit ledger.'}
          </p>
        </section>
      </div>
    </main>
  );
}

export function PrivacyPage() {
  const { lang, t, navigate } = useApp();
  const isTr = lang === 'tr';

  return (
    <main className="mx-auto max-w-[960px] px-6 py-12">
      <button
        type="button"
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-2 text-xs font-medium text-[#A9AEA7] hover:text-[#E9E7DF]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>{t.nav.home}</span>
      </button>

      <header className="mt-6 border-b border-[#1D2823] pb-6">
        <p className="font-mono text-xs tracking-wider text-[#557B67]">
          SENTARIKA ARCHIVE · {t.slogan}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-[#E9E7DF] sm:text-4xl">
          {t.legal.privacyTitle}
        </h1>
        <p className="mt-2 font-mono text-xs text-[#8D968F]">{t.legal.lastUpdated}</p>
      </header>

      <PolicySubNav active="privacy" />

      <div className="mt-8 space-y-8 text-sm leading-[1.85] text-[#C8CEC7]">
        <section className="rounded-lg border border-[#223029] bg-[#101715] p-6">
          <div className="flex items-center gap-2.5 text-[#557B67]">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <h2 className="font-display text-xl font-semibold text-[#E9E7DF]">
              {isTr
                ? '1. Veri Minimizasyonu ve Sıfır Kişisel İletişim Verisi'
                : '1. Data Minimization & Zero Contact PII'}
            </h2>
          </div>
          <p className="mt-3">
            {isTr
              ? 'Sentarika Archive e-posta adresi, telefon numarası, ad-soyad veya harici OAuth profili istemez ve saklamaz. Hesap kaydı yalnızca benzersiz kullanıcı adı, rütbe/özel rol atamaları, dil tercihi ve isteğe bağlı TOTP MFA durumundan oluşur.'
              : 'Sentarika Archive does not request or store email addresses, phone numbers, real names, or external OAuth profiles. Account state consists solely of your username, rank/custom role assignments, language preference, and optional TOTP MFA state.'}
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-[#E9E7DF]">
            {isTr ? '2. Anahtarlar ve Oturum Güvenliği' : '2. Access Key Hashing & Session Cookies'}
          </h2>
          <p className="mt-3">
            {isTr
              ? 'Erişim anahtarları hiçbir zaman düz metin olarak veritabanında veya sunucu günlüklerinde tutulmaz. Oturum çerezleri HttpOnly, SameSite=Lax ve TLS üzerinde Secure bayraklarıyla korunur; yalnızca güvenlik denetimi ve kullanıcının kendi cihaz oturumlarını yönetebilmesi amacıyla aktif oturum IP/tarayıcı bilgisi tutulur.'
              : 'Plaintext access keys are never written to the database, logs, or analytics. Session cookies use HttpOnly, SameSite=Lax, and Secure flags over HTTPS, and active session metadata is exposed in your Security console so you can revoke any device anytime.'}
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold text-[#E9E7DF]">
            {isTr ? '3. Dosya Güvenliği ve İndirme Bağlantıları' : '3. File Storage & Signed Downloads'}
          </h2>
          <p className="mt-3">
            {isTr
              ? 'Yüklenen arşiv dosyaları herkese açık dizinler yerine korumalı özel depolamada tutulur ve yalnızca yetki ile imza süresi doğrulanan kısa ömürlü imzalı bağlantılar üzerinden sunulur.'
              : 'Uploaded archival documents are stored in private non-public storage and streamed strictly via user-bound, short-lived HMAC signed URLs after real-time permission checks.'}
          </p>
        </section>
      </div>
    </main>
  );
}
