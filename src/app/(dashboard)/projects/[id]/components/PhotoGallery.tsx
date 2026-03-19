'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { X, ChevronLeft, ChevronRight, Upload, PlayCircle } from 'lucide-react'

interface Asset {
    id: string
    file_url: string
    type?: string
}

export default function PhotoGallery({ assets }: { assets: Asset[] }) {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

    const openLightbox = (index: number) => setSelectedIndex(index)
    const closeLightbox = () => setSelectedIndex(null)

    const showPrev = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (selectedIndex !== null) {
            setSelectedIndex(selectedIndex === 0 ? assets.length - 1 : selectedIndex - 1)
        }
    }

    const showNext = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (selectedIndex !== null) {
            setSelectedIndex(selectedIndex === assets.length - 1 ? 0 : selectedIndex + 1)
        }
    }

    // Handle keyboard navigation (Escape to close, arrows to navigate)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (selectedIndex === null) return

            if (e.key === 'Escape') closeLightbox()
            if (e.key === 'ArrowLeft') {
                setSelectedIndex(selectedIndex === 0 ? assets.length - 1 : selectedIndex - 1)
            }
            if (e.key === 'ArrowRight') {
                setSelectedIndex(selectedIndex === assets.length - 1 ? 0 : selectedIndex + 1)
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [selectedIndex, assets.length])

    // Prevent background scrolling when modal is open
    useEffect(() => {
        if (selectedIndex !== null) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = 'auto'
        }
        return () => {
            document.body.style.overflow = 'auto'
        }
    }, [selectedIndex])

    return (
        <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
                <h3 className="section-title">업로드된 사진</h3>
                <span className="text-sm font-medium text-stone-600 bg-stone-100 px-2 py-1 rounded-md">{assets.length}장</span>
            </div>

            {assets.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {assets.map((asset, idx) => (
                        <div
                            key={asset.id ?? idx}
                            className="relative aspect-[4/3] rounded-lg overflow-hidden border border-stone-200 group cursor-pointer"
                            onClick={() => openLightbox(idx)}
                        >
                            {asset.type === 'video' ? (
                                <>
                                    <video
                                        src={asset.file_url}
                                        className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
                                        preload="metadata"
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <PlayCircle className="text-white w-10 h-10 opacity-80 drop-shadow-md" />
                                    </div>
                                </>
                            ) : (
                                <Image
                                    src={asset.file_url}
                                    alt={`매물 사진 ${idx + 1}`}
                                    fill
                                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                                    sizes="(max-width: 768px) 50vw, 300px"
                                />
                            )}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300 pointer-events-none" />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-stone-50 rounded-lg p-8 text-center border-2 border-dashed border-stone-200">
                    <Upload size={32} className="mx-auto text-stone-300 mb-3" />
                    <p className="text-sm font-medium text-stone-500">등록된 사진이 없습니다</p>
                    <p className="text-xs text-stone-400 mt-1">새 매물 등록 화면에서 사진을 업로드할 수 있습니다.</p>
                </div>
            )}

            {/* Lightbox Modal */}
            {selectedIndex !== null && (
                <div
                    className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center animate-fade-in"
                    onClick={closeLightbox}
                >
                    <button
                        className="absolute top-6 right-6 p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-colors z-10 focus:outline-none"
                        onClick={closeLightbox}
                    >
                        <X size={28} />
                    </button>

                    {assets.length > 1 && (
                        <button
                            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-colors z-10 focus:outline-none hidden sm:block"
                            onClick={showPrev}
                        >
                            <ChevronLeft size={32} />
                        </button>
                    )}

                    <div className="relative w-full max-w-6xl h-[85vh] px-4 sm:px-20" onClick={e => e.stopPropagation()}>
                        {assets[selectedIndex].type === 'video' ? (
                            <video
                                src={assets[selectedIndex].file_url}
                                className="w-full h-full object-contain"
                                controls
                                autoPlay
                            />
                        ) : (
                            <Image
                                src={assets[selectedIndex].file_url}
                                alt={`확대된 사진 ${selectedIndex + 1}`}
                                fill
                                className="object-contain"
                                sizes="100vw"
                                priority
                            />
                        )}
                    </div>

                    {assets.length > 1 && (
                        <button
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-colors z-10 focus:outline-none hidden sm:block"
                            onClick={showNext}
                        >
                            <ChevronRight size={32} />
                        </button>
                    )}

                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/60 backdrop-blur-md rounded-full text-white/90 text-sm font-medium tracking-wider">
                        {selectedIndex + 1} <span className="text-white/50 mx-1">/</span> {assets.length}
                    </div>
                </div>
            )}
        </div>
    )
}
