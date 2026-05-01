export default function UserPage() {
  return (
    <section className="px-5 pt-4">
      <div className="overflow-hidden rounded-[24px] bg-white shadow-[0_2px_14px_rgba(42,29,24,0.05)]">
        <div className="border-b border-[#eadccc] px-5 py-5">
          <h1 className="text-[20px] font-semibold leading-[1.65] tracking-[-0.01em] text-[#2a1d18]">
            はじめまして。私はペットタクシーの予約をサポートするAIアシスタントです。
          </h1>
        </div>

        <div className="space-y-2.5 px-5 py-5">
          <button className="w-full rounded-[20px] bg-[#c9a77d] px-4 py-3 text-[15px] font-medium leading-[1.65] text-white shadow-[0_2px_8px_rgba(42,29,24,0.06)]">
            予約する
          </button>
          <button className="w-full rounded-[20px] border border-[#e1d2c4] bg-white px-4 py-3 text-[15px] font-medium leading-[1.65] text-[#2a1d18] shadow-[0_1px_4px_rgba(42,29,24,0.04)]">
            料金確認
          </button>
          <button className="w-full rounded-[20px] border border-[#e1d2c4] bg-white px-4 py-3 text-[15px] font-medium leading-[1.65] text-[#2a1d18] shadow-[0_1px_4px_rgba(42,29,24,0.04)]">
            相談する
          </button>
        </div>
      </div>
    </section>
  )
}