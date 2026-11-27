import React, { useState } from 'react';
import { ArrowRight, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { formatPhone, getCustomerProfile } from '../services/customerService';

export const COUNTRY_CODES = [
  { code: '+91', country: 'IN', label: '+91 (India)', digits: 10 },
  { code: '+1', country: 'US', label: '+1 (US/Canada)', digits: 10 },
  { code: '+44', country: 'GB', label: '+44 (UK)', digits: 10 },
  { code: '+971', country: 'AE', label: '+971 (UAE)', digits: 9 },
  { code: '+65', country: 'SG', label: '+65 (Singapore)', digits: 8 },
  { code: '+61', country: 'AU', label: '+61 (Australia)', digits: 9 },
];

export interface PhoneGateModalProps {
  isOpen: boolean;
  tableId?: string;
  tableName?: string;
  onSuccess: (normalizedPhone: string) => void;
}

export const PhoneGateModal: React.FC<PhoneGateModalProps> = ({
  isOpen,
  tableId,
  tableName,
  onSuccess,
}) => {
  const [countryCode, setCountryCode] = useState<string>('+91');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  const currentCountry = COUNTRY_CODES.find((c) => c.code === countryCode) || COUNTRY_CODES[0];
  const requiredDigits = currentCountry.digits || 10;

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow digits
    const cleaned = e.target.value.replace(/\D/g, '');
    if (cleaned.length <= 12) {
      setPhoneNumber(cleaned);
      if (error) setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = phoneNumber.trim();

    // Validate 10 digits (or country specific required digits)
    if (!cleaned) {
      setError('Please enter your mobile phone number.');
      return;
    }

    if (cleaned.length !== requiredDigits) {
      setError(`Please enter a valid ${requiredDigits}-digit mobile number.`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const normalizedPhone = formatPhone(`${countryCode}${cleaned}`);

    try {
      // 1. Save to localStorage immediately
      localStorage.setItem('dineview_phone', normalizedPhone);

      // 2. Fetch existing customer profile from Firestore / cache
      const profile = await getCustomerProfile(normalizedPhone);

      // 3. Dispatch global event so FoodAssistantModal and other components update immediately
      window.dispatchEvent(
        new CustomEvent('dineview:phone_updated', {
          detail: { phone: normalizedPhone, profile },
        })
      );

      // 4. Trigger success callback to dismiss gate
      onSuccess(normalizedPhone);
    } catch (err) {
      console.warn('Phone gate save notice:', err);
      // Still proceed with normalized phone stored locally
      onSuccess(normalizedPhone);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[200] bg-neutral-950/75 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="phone-gate-title"
    >
      <div className="w-full max-w-md bg-bg-primary border border-border shadow-xl rounded-sm p-6 sm:p-8 relative">
        {/* Table & Branding Header */}
        <div className="mb-6">
          <p className="text-xs font-medium text-accent mb-2">
            DineView{tableId && tableId !== 'COUNTER' ? ` · ${tableName || `Table ${tableId}`}` : ''}
          </p>

          <h2 id="phone-gate-title" className="text-2xl sm:text-3xl font-serif font-medium text-text-primary mb-2 tracking-tight">
            Welcome to DineView
          </h2>
          
          <p className="text-sm text-text-secondary leading-relaxed">
            Enter your mobile phone number to browse the menu, place table orders, and receive tailored dining suggestions.
          </p>
        </div>

        {/* Mandatory Phone Input Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="phone-gate-input" className="block text-xs font-medium text-text-primary mb-2">
              Mobile Phone Number <span className="text-red-600">*</span>
            </label>

            <div className="flex gap-2">
              {/* Country Code Selector */}
              <select
                value={countryCode}
                onChange={(e) => {
                  setCountryCode(e.target.value);
                  setError(null);
                }}
                className="border border-border bg-white px-3 py-2.5 rounded-sm text-xs font-medium text-text-primary focus:outline-none focus:border-text-primary shrink-0"
                aria-label="Country Code"
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>

              {/* Phone Input */}
              <div className="relative flex-1">
                <input
                  id="phone-gate-input"
                  type="tel"
                  inputMode="numeric"
                  autoFocus
                  required
                  value={phoneNumber}
                  onChange={handlePhoneChange}
                  placeholder={`${requiredDigits}-digit mobile number`}
                  className={`w-full border bg-white ${
                    error ? 'border-red-500' : 'border-border'
                  } px-3 py-2.5 rounded-sm text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-text-primary font-mono tabular-nums`}
                  aria-invalid={Boolean(error)}
                />
              </div>
            </div>

            {error ? (
              <p className="mt-2 text-xs text-red-600 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </p>
            ) : (
              <p className="mt-2 text-xs text-text-muted flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-accent shrink-0" />
                <span>Used for table order updates and dining preferences.</span>
              </p>
            )}
          </div>

          {/* Compulsory Submit Button (NO SKIP) */}
          <button
            type="submit"
            disabled={isSubmitting || phoneNumber.length !== requiredDigits}
            className="w-full bg-text-primary text-bg-primary py-3 px-6 rounded-sm text-xs font-medium tracking-wide hover:bg-text-primary/90 transition-colors disabled:opacity-45 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Opening Menu...</span>
              </>
            ) : (
              <>
                <span>Continue to Menu</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-border">
          <p className="text-xs text-text-muted">
            Phone verification is required for table orders and personalized dining history.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PhoneGateModal;
