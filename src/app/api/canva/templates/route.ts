import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ templates: [] })

    const { data, error } = await supabase
      .from('canva_template_sets')
      .select('id, name, description, thumbnail_url, category, template_ids, gradient, accent_color')
      .eq('is_active', true)
      .order('sort_order')

    if (error) {
      console.error('canva_template_sets fetch error:', error.message)
      return NextResponse.json({ templates: [] })
    }
    return NextResponse.json({ templates: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ templates: [] })
  }
}
