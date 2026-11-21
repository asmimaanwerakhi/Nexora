import { Link } from 'react-router-dom';

function AuthHeader() {
  return (
    <header className="flex items-center justify-between py-6">
      <Link to="/" className="inline-flex items-center" aria-label="Nexora home">
        <img
          src="/icons/CorpTalk-Logo.png"
          alt=""
          className="h-11 w-11 rounded-[10px] object-contain"
        />
      </Link>
      <span className="hidden text-sm text-text-muted sm:block">A better way to work together</span>
    </header>
  );
}

export default AuthHeader;
