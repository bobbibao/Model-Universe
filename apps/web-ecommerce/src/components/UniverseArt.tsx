'use client';

import { useRef } from 'react';

// Original editorial mecha artwork. This is never used as an actual product photograph.
export default function UniverseArt() {
  const visor = useRef<SVGPathElement>(null);
  const animate = async () => {
    if (!visor.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const [{ gsap }, { MorphSVGPlugin }] = await Promise.all([import('gsap'), import('gsap/MorphSVGPlugin')]);
    if (!visor.current) return;
    gsap.registerPlugin(MorphSVGPlugin);
    gsap.to(visor.current, { morphSVG: 'M172 159L200 167L228 159L221 178L200 184L179 178Z', duration: .35, yoyo: true, repeat: 1, overwrite: true });
  };
  return <div className="mu-hero-art" onPointerEnter={animate} onPointerDown={animate}>
    <div className="mu-orbit" aria-hidden="true" />
    <svg viewBox="0 0 400 420" role="img" aria-label="Model Universe original mecha artwork">
      <defs><linearGradient id="armor" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#edf5fa"/><stop offset="1" stopColor="#788ba7"/></linearGradient><linearGradient id="blue" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#327dae"/><stop offset="1" stopColor="#13283e"/></linearGradient></defs>
      <circle cx="200" cy="205" r="157" fill="none" stroke="#5be7f3" strokeOpacity=".2" />
      <path d="M62 307L99 242L155 219H245L301 242L338 307L313 347H87Z" fill="url(#blue)" stroke="#89a4c4"/>
      <path d="M98 244L145 237L139 306L80 330L57 301ZM302 244L255 237L261 306L320 330L343 301Z" fill="url(#armor)"/>
      <path d="M150 235L174 257H226L250 235L247 316L200 343L153 316Z" fill="#162737" stroke="#6489aa"/>
      <path d="M167 278H187L181 303H161ZM213 278H233L239 303H219Z" fill="#5be7f3"/>
      <path d="M148 145L164 119H236L252 145L242 204L222 225H178L158 204Z" fill="url(#armor)" stroke="#b6c5d8"/>
      <path d="M161 153L200 167L239 153L230 181L200 195L170 181Z" fill="#0a1220"/>
      <path ref={visor} d="M172 159L200 167L228 159L221 171L200 177L179 171Z" fill="#5be7f3"/>
      <path d="M159 132L111 83L173 116L200 147L227 116L289 83L241 132L213 148H187Z" fill="#f0cc64" stroke="#fff0ad"/>
      <path d="M185 188L200 179L215 188L213 207H187Z" fill="#d66254"/>
      <path d="M153 170L136 177L144 211L172 220L170 188ZM247 170L264 177L256 211L228 220L230 188Z" fill="url(#armor)"/>
      <path d="M167 337L200 349L233 337L245 368H155Z" fill="url(#armor)"/>
      <path d="M48 213H102M298 213H352M200 42V75M200 380V407" stroke="#5be7f3" strokeOpacity=".5"/>
      <circle cx="48" cy="213" r="3" fill="#5be7f3"/><circle cx="352" cy="213" r="3" fill="#5be7f3"/>
      <text x="21" y="241" fill="#aebccf" fontSize="9" letterSpacing="2">MU / 01</text><text x="300" y="393" fill="#aebccf" fontSize="9" letterSpacing="2">COLLECTOR EDITION</text>
    </svg>
  </div>;
}
