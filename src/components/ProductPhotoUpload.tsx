import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Product } from '../types';
import { Upload, Image as ImageIcon, RefreshCw, CheckCircle2, X, AlertTriangle } from 'lucide-react';

interface ProductPhotoUploadProps {
  product: Product;
  onPhotoUploaded?: (productId: string) => void;
}

export const ProductPhotoUpload: React.FC<ProductPhotoUploadProps> = ({
  product,
  onPhotoUploaded,
}) => {
  const {
    currentUser,
    updateProduct,
  } = useApp();

  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const isRep = currentUser?.role === 'sales_rep';
  const canApprove = ['branch_manager', 'supervisor', 'sales_department_manager', 'top_management', 'admin', 'developer'].includes(currentUser?.role || '');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    if (!selectedFile.type.startsWith('image/')) {
      alert('يرجى اختيار ملف صورة فقط');
      return;
    }
    setFile(selectedFile);
    setPreviewUrl(URL.createObjectURL(selectedFile));
  };

  const handleUpload = async () => {
    if (!file || !currentUser) return;
    setUploading(true);
    try {
      const imageUrl = previewUrl || '';

      const updatedProduct: Product = {
        ...product,
        imageUrl,
        photoStatus: 'pending',
        photoUploadedBy: currentUser.name,
        photoUploadedAt: new Date().toISOString(),
        photoApprovedBy: undefined,
        photoApprovedAt: undefined,
        photoApprovedRole: undefined,
        photoRejectionReason: undefined,
      };

      updateProduct(updatedProduct);
      setUploading(false);
      setFile(null);
      setPreviewUrl(null);
      onPhotoUploaded?.(product.id);
    } catch (err) {
      console.error('Upload error:', err);
      alert('فشل رفع الصورة');
      setUploading(false);
    }
  };

  const handleApprove = (approve: boolean, reason?: string) => {
    if (!currentUser) return;
    const updatedProduct: Product = {
      ...product,
      photoStatus: approve ? 'approved' : 'rejected',
      photoApprovedBy: currentUser.name,
      photoApprovedAt: new Date().toISOString(),
      photoApprovedRole: currentUser.role,
      photoRejectionReason: approve ? undefined : reason,
    };
    updateProduct(updatedProduct);
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'text-emerald-600 bg-emerald-50';
      case 'rejected': return 'text-rose-600 bg-rose-50';
      default: return 'text-amber-600 bg-amber-50';
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
      <div className="flex items-center gap-3">
        <ImageIcon className="w-6 h-6 text-amber-600" />
        <h3 className="font-black text-slate-900">صورة المنتج - {product.name}</h3>
      </div>

      <div className="flex items-center gap-4">
        <div className="w-32 h-32 rounded-xl border border-slate-200 overflow-hidden flex items-center justify-center bg-slate-50">
          {(previewUrl || product.imageUrl) && (
            <img src={previewUrl || product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
          )}
          {!previewUrl && !product.imageUrl && (
            <div className="flex flex-col items-center justify-center h-full">
              <Upload className="w-8 h-8 text-slate-400 mb-1" />
              <span className="text-[10px] text-slate-400">لا توجد صورة</span>
            </div>
          )}
        </div>

        <div className="flex-1">
          {product.photoStatus && (
            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${statusColor(product.photoStatus)}`}>
              {product.photoStatus === 'approved' ? '✓ معتمدة' : product.photoStatus === 'rejected' ? '✗ مرفوضة' : '⏳ قيد الانتظار'}
              {product.photoApprovedBy && <span className="text-[9px] opacity-70">بواسطة: {product.photoApprovedBy}</span>}
            </div>
          )}
          {product.photoRejectionReason && (
            <div className="mt-1 text-[10px] text-rose-600">السبب: {product.photoRejectionReason}</div>
          )}
        </div>
      </div>

      {isRep && (
        <div className="space-y-3">
          <label className="block text-xs font-bold text-slate-600">رفع صورة المنتج</label>
          <div className="relative">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <button
              type="button"
              disabled={uploading || !file}
              className="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 text-sm font-bold text-slate-600 hover:border-amber-500 hover:bg-amber-50 transition flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" />
              {file ? 'تغيير الصورة' : 'اختر صورة من الجهاز'}
            </button>
          </div>
          {previewUrl && (
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className="w-full py-2 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 transition disabled:opacity-50"
            >
              {uploading ? 'جاري الرفع...' : 'رفع الصورة (ستكون قيد الانتظار للموافقة)'}
            </button>
          )}
        </div>
      )}

      {/* اعتماد الصورة للمدراء - Pending */}
      {canApprove && product.photoStatus === 'pending' && (
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span className="font-black text-amber-800 text-sm">في انتظار اعتماد الصورة</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleApprove(true)}
              className="flex-1 py-2 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition"
            >
              <CheckCircle2 className="w-4 h-4 mr-1" />
              اعتماد
            </button>
            <button
              type="button"
              onClick={() => {
                const reason = prompt('سبب الرفض:');
                if (reason !== null) handleApprove(false, reason);
              }}
              className="flex-1 py-2 rounded-xl bg-rose-600 text-white font-bold text-sm hover:bg-rose-700 transition"
            >
              <X className="w-4 h-4 mr-1" />
              رفض
            </button>
          </div>
        </div>
      )}

      {canApprove && product.photoStatus === 'rejected' && (
        <div className="bg-rose-50 rounded-xl p-4 border border-rose-200">
          <div className="flex items-center gap-2 mb-2">
            <X className="w-4 h-4 text-rose-600" />
            <span className="font-black text-rose-800 text-sm">الصورة مرفوضة</span>
          </div>
          <div className="text-[10px] text-rose-600">{product.photoRejectionReason}</div>
          <button
            type="button"
            onClick={() => handleApprove(true)}
            className="mt-2 py-2 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition w-full"
          >
            اعتماد الصورة الآن
          </button>
        </div>
      )}
    </div>
  );
};