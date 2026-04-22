import React, { useState } from 'react';
import { atlasApiUrl } from '../lib/atlasApi';

type PaidTier = 'sovereign' | 'zenith';

interface Plan {
  id: 'core' | PaidTier;
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  features: string[];
  cta: string;
  recommended?: boolean;
  premium?: boolean;
}

const PLANS: Plan[] = [
  {
    id: 'core',
    name: 'Core',
    price: 'Free',
    cadence: '',
    tagline: 'Start your sovereignty practice.',
    features: [
      '120 chats per day',
      'Llama 3.3 70B + Gemini 2.5 Flash',
      'OmniRouter auto-selection',
      'Local Memory Vault',
      'Sovereign data posture',
    ],
    cta: 'Current plan',
  },
  {
    id: 'sovereign',
    name: 'Sovereign',
    price: '$12',
    cadence: '/month',
    tagline: 'For daily thinkers who demand precision.',
    features: [
      '500 chats per day',
      'Everything in Core',
      'GPT-5.4 Mini access',
      '7-day free trial',
      'Priority routing',
    ],
    cta: 'Upgrade to Sovereign',
    recommended: true,
  },
  {
    id: 'zenith',
    name: 'Zenith',
    price: '$39',
    cadence: '/month',
    tagline: 'Unlimited depth. Frontier minds.',
    features: [
      'Unlimited chats',
      'Everything in Sovereign',
      'GPT-5.4 + GPT-5.4 Pro',
      'Claude Sonnet 4.6 + Opus 4.6',
      '3-day free trial',
    ],
    cta: 'Ascend to Zenith',
    premium: true,
  },
];

const COLORS = {
  bg: '#0D0D0D',
  card: '#14110B',
  cardBorder: 'rgba(201,168,76,0.12)',
  cardBorderActive: 'rgba(201,168,76,0.5)',
  gold: '#C9A84C',
  goldDim: 'rgba(201,168,76,0.6)',
  text: '#F5F5F5',
  textDim: 'rgba(245,245,245,0.55)',
  textFaint: 'rgba(245,245,245,0.3)',
};

export function PricingPlans() {
  const [loading, setLoading] = useState<PaidTier | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async (tier: PaidTier) => {
    setLoading(tier);
    setError(null);
    try {
      const res = await fetch(atlasApiUrl('/v1/stripe/create-checkout-session'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tier }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error((body as { error?: string }).error ?? `Checkout failed (${res.status})`);
      }
      const data = (await res.json()) as { url: string };
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
      setLoading(null);
    }
  };

  return (
    <div style={{
      background: COLORS.bg,
      padding: '48px 24px',
      color: COLORS.text,
      fontFamily: 'inherit',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h2 style={{
            fontSize: '1.9rem',
            fontWeight: 300,
            letterSpacing: '0.06em',
            color: COLORS.text,
            margin: 0,
          }}>
            Choose your practice
          </h2>
          <p style={{
            marginTop: 10,
            fontSize: '0.85rem',
            color: COLORS.textDim,
            letterSpacing: '0.04em',
          }}>
            Every plan preserves sovereignty. Upgrade for depth, not for permission.
          </p>
        </div>

        {error && (
          <div style={{
            maxWidth: 560,
            margin: '0 auto 24px',
            padding: '10px 14px',
            background: 'rgba(220,80,80,0.08)',
            border: '1px solid rgba(220,80,80,0.3)',
            borderRadius: 6,
            color: '#f5a3a3',
            fontSize: '0.8rem',
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 18,
        }}>
          {PLANS.map((plan) => {
            const isPaid = plan.id !== 'core';
            const borderColor = plan.recommended || plan.premium
              ? COLORS.cardBorderActive
              : COLORS.cardBorder;
            const shadow = plan.premium
              ? '0 0 40px rgba(201,168,76,0.18), inset 0 1px 0 rgba(201,168,76,0.15)'
              : plan.recommended
              ? '0 0 24px rgba(201,168,76,0.12)'
              : 'none';

            return (
              <div
                key={plan.id}
                style={{
                  position: 'relative',
                  background: plan.premium
                    ? 'linear-gradient(180deg, rgba(201,168,76,0.06) 0%, rgba(20,17,11,0.95) 60%)'
                    : COLORS.card,
                  border: `1px solid ${borderColor}`,
                  borderRadius: 10,
                  padding: '28px 24px 24px',
                  boxShadow: shadow,
                  transition: 'transform 160ms ease, box-shadow 160ms ease',
                }}
              >
                {plan.recommended && (
                  <div style={{
                    position: 'absolute',
                    top: -11,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: COLORS.gold,
                    color: COLORS.bg,
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    padding: '3px 10px',
                    borderRadius: 4,
                    textTransform: 'uppercase',
                  }}>
                    Recommended
                  </div>
                )}
                {plan.premium && (
                  <div style={{
                    position: 'absolute',
                    top: -11,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: COLORS.bg,
                    color: COLORS.gold,
                    border: `1px solid ${COLORS.gold}`,
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    padding: '3px 10px',
                    borderRadius: 4,
                    textTransform: 'uppercase',
                  }}>
                    Frontier
                  </div>
                )}

                <div style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: plan.premium || plan.recommended ? COLORS.gold : COLORS.textDim,
                  marginBottom: 8,
                }}>
                  {plan.name}
                </div>

                <div style={{ marginBottom: 6 }}>
                  <span style={{
                    fontSize: '2.1rem',
                    fontWeight: 300,
                    color: COLORS.text,
                    letterSpacing: '-0.01em',
                  }}>
                    {plan.price}
                  </span>
                  {plan.cadence && (
                    <span style={{
                      fontSize: '0.85rem',
                      color: COLORS.textDim,
                      marginLeft: 4,
                    }}>
                      {plan.cadence}
                    </span>
                  )}
                </div>

                <p style={{
                  fontSize: '0.8rem',
                  color: COLORS.textDim,
                  margin: '0 0 22px',
                  lineHeight: 1.5,
                  minHeight: 38,
                }}>
                  {plan.tagline}
                </p>

                <ul style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: '0 0 28px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}>
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        fontSize: '0.82rem',
                        color: COLORS.text,
                        lineHeight: 1.4,
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={COLORS.gold}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ marginTop: 3, flexShrink: 0 }}
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {isPaid ? (
                  <button
                    onClick={() => void handleCheckout(plan.id as PaidTier)}
                    disabled={loading !== null}
                    style={{
                      width: '100%',
                      padding: '11px 14px',
                      background: plan.premium ? COLORS.gold : 'transparent',
                      color: plan.premium ? COLORS.bg : COLORS.gold,
                      border: `1px solid ${COLORS.gold}`,
                      borderRadius: 6,
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      cursor: loading !== null ? 'wait' : 'pointer',
                      opacity: loading !== null && loading !== plan.id ? 0.5 : 1,
                      transition: 'all 140ms ease',
                      fontFamily: 'inherit',
                    }}
                  >
                    {loading === plan.id ? 'Redirecting…' : plan.cta}
                  </button>
                ) : (
                  <div style={{
                    width: '100%',
                    padding: '11px 14px',
                    border: `1px solid ${COLORS.cardBorder}`,
                    borderRadius: 6,
                    fontSize: '0.78rem',
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: COLORS.textFaint,
                    textAlign: 'center',
                  }}>
                    {plan.cta}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p style={{
          textAlign: 'center',
          marginTop: 32,
          fontSize: '0.7rem',
          color: COLORS.textFaint,
          letterSpacing: '0.06em',
        }}>
          Cancel anytime. A 3-day grace period preserves your tier after a failed renewal.
        </p>
      </div>
    </div>
  );
}
