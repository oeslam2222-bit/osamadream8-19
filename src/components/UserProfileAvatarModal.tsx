import React, { useState, useRef } from 'react';
import { Camera, Upload, X, Check, Loader2, Sparkles, User, AlertCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { uploadUserAvatar, compressImageFile } from '../services/cloudinaryService';

interface UserProfileAvatarModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_EXECUTIVE_AVATAR = '/assets/rep-avatar.jpg';

export const UserProfileAvatarModal: React.FC<UserProfileAvatarModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, updateCurrentUserAvatar, cloudinaryConfig } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen || !currentUser) return null;

  const currentAvatar = currentUser.avatar || DEFAULT_EXECUTIVE_AVATAR;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('يرجى اختيار ملف صورة صالح (JPEG, PNG, WebP).');
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setSelectedFile(file);

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  };

  const handleUploadAndSave = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      let finalAvatarUrl: string | null = null;
      let usedCloud = false;

      // 1. Try compress & upload to Cloudinary (zero Supabase egress, CDN hosted)
      try {
        const uploadResult = await uploadUserAvatar(
          selectedFile,
          currentUser.id,
          cloudinaryConfig
        );
        if (uploadResult && uploadResult.url) {
          finalAvatarUrl = uploadResult.url;
          usedCloud = true;
        }
      } catch (cloudErr) {
        console.warn('Cloudinary upload fallback triggered:', cloudErr);
      }

      // 2. Safe Fallback: Compress locally to < 35KB and convert to Data URL
      if (!finalAvatarUrl) {
        const compressed = await compressImageFile(selectedFile, 240, 240, 0.7);
        finalAvatarUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('فشل قراءة ملف الصورة محلياً'));
          reader.readAsDataURL(compressed);
        });
      }

      // 3. Save avatar to profile state, IDB and localStorage
      const success = await updateCurrentUserAvatar(finalAvatarUrl);
      if (!success) {
        throw new Error('تعذر تحديث صورة ملف المستخدم');
      }

      setSuccessMessage(
        usedCloud
          ? 'تم حفظ صورتك الشخصية بنجاح على سيرفرات Cloudinary السحابية!'
          : 'تم حفظ صورتك الشخصية بنجاح وتحديث حسابك!'
      );

      setTimeout(() => {
        onClose();
        setPreviewUrl(null);
        setSelectedFile(null);
        setSuccessMessage(null);
      }, 1200);
    } catch (err: any) {
      console.error('Avatar save failure:', err);
      setErrorMessage(err?.message || 'حدث خطأ أثناء حفظ الصورة. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-500/20 text-[#2563EB] dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-500/30">
              <Camera className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="font-black text-base text-[#0F172A] dark:text-white">تعديل الصورة الشخصية</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                تُرفع على Cloudinary وتُحفظ دون استهلاك باقة السيرفر
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Avatar Preview */}
        <div className="flex flex-col items-center justify-center space-y-3 py-2">
          <div className="relative group">
            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl overflow-hidden border-4 border-white dark:border-[#17243A] shadow-xl ring-2 ring-blue-500/30">
              <img
                src={previewUrl || currentAvatar}
                alt={currentUser.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = DEFAULT_EXECUTIVE_AVATAR;
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl bg-[#2563EB] text-white flex items-center justify-center shadow-lg hover:bg-blue-700 active:scale-95 transition-all cursor-pointer border-2 border-white dark:border-[#111C2E]"
              title="اختيار صورة من الجهاز"
            >
              <Camera className="w-5 h-5 stroke-[2.2]" />
            </button>
          </div>

          <div className="text-center">
            <div className="font-black text-sm text-[#0F172A] dark:text-white">{currentUser.name}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">{currentUser.branchName}</div>
          </div>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Status Messages */}
        {errorMessage && (
          <div className="flex items-center gap-2 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/40 text-xs font-bold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="flex items-center gap-2 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/40 text-xs font-bold">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2.5 pt-2">
          {!selectedFile ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 py-3 px-4 rounded-2xl bg-blue-50 dark:bg-blue-500/20 text-[#2563EB] dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 font-bold text-sm flex items-center justify-center gap-2 hover:bg-blue-100 dark:hover:bg-blue-500/30 transition-all cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>اختيار صورة جديدة</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={isUploading}
                onClick={handleUploadAndSave}
                className="flex-1 py-3 px-4 rounded-2xl bg-[#2563EB] hover:bg-blue-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جارٍ الضغط والرفع...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>تأكيد وحفظ الصورة</span>
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={isUploading}
                onClick={() => {
                  setSelectedFile(null);
                  setPreviewUrl(null);
                }}
                className="py-3 px-4 rounded-2xl bg-slate-100 dark:bg-[#17243A] text-slate-700 dark:text-slate-300 font-bold text-sm hover:bg-slate-200 dark:hover:bg-[#20304a] transition-all cursor-pointer"
              >
                إلغاء
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
