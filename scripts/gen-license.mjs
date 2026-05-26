import { writeFileSync } from 'fs'

function rtf(str) {
  let out = ''
  for (const ch of str) {
    const c = ch.charCodeAt(0)
    if (c < 128) {
      if (ch === '\\') out += '\\\\'
      else if (ch === '{') out += '\\{'
      else if (ch === '}') out += '\\}'
      else out += ch
    } else {
      out += `\\u${c > 32767 ? c - 65536 : c}?`
    }
  }
  return out
}

const p  = t => `\\pard\\sa120\\sl240\\slmult1 ${rtf(t)}\\par\n`
const h  = t => `\\pard\\sa80\\sl240\\slmult1\\b ${rtf(t)}\\b0\\par\n`
const li = t => `\\pard\\li360\\sa60\\sl240\\slmult1 ${rtf('• ' + t)}\\par\n`

const content = `{\\rtf1\\ansi\\deff0\n{\\fonttbl{\\f0\\fswiss Arial;}}\n\\f0\\fs20\n\n` +
  h('TEoVerse AI 오피스 — 이용 약관 및 법적 고지') +
  p('Copyright (c) 2026 TEoVerse. All rights reserved.') +
  '\n' +
  h('[외부 배포 금지 및 법적 책임 고지]') +
  p('본 소프트웨어를 TEoVerse의 명시적 서면 동의 없이 제3자에게 재배포, 판매, 공유 또는 유출할 경우, 해당 행위자는 저작권법 및 관련 법령에 따라 민·형사상 법적 책임을 집니다.') +
  '\n' +
  h('제1조 (소유권)') +
  p('본 소프트웨어의 모든 저작권, 특허권, 영업비밀 및 기타 지식재산권은 TEoVerse에 귀속됩니다. 사용자는 소프트웨어를 사용할 권리를 부여받을 뿐이며, 어떠한 권리도 양도받지 않습니다.') +
  '\n' +
  h('제2조 (허용 범위)') +
  p('TEoVerse가 직접 제공한 설치 파일을 통해 본인 기기에 설치하여 내부 업무 목적으로 사용하는 것만 허용됩니다.') +
  '\n' +
  h('제3조 (금지 행위)') +
  p('다음 행위는 엄격히 금지됩니다:') +
  li('소프트웨어의 복사, 복제, 재배포 및 외부 전달') +
  li('소프트웨어의 역공학(리버스 엔지니어링), 디컴파일, 소스코드 추출') +
  li('상업적 목적의 무단 사용 또는 판매') +
  li('소프트웨어의 일부 또는 전체를 제3자에게 유출') +
  '\n' +
  h('제4조 (법적 책임)') +
  li('형사 책임: 저작권법 위반으로 5년 이하 징역 또는 5천만 원 이하 벌금') +
  li('민사 책임: 손해배상, 사용 금지 가처분 등 민사 소송') +
  li('기타: 라이선스 즉시 취소 및 법원 명령에 따른 소프트웨어 사용 중단') +
  '\n' +
  h('제5조 (준거법)') +
  p('본 약관은 대한민국 법률에 따라 해석되며, 분쟁 발생 시 TEoVerse 소재지 관할 법원을 전속 관할 법원으로 합니다.') +
  '\n' +
  p('본 소프트웨어를 설치함으로써 위 약관에 동의하는 것으로 간주합니다.') +
  '}'

writeFileSync('build/license.rtf', content, 'utf8')
console.log('license.rtf 생성 완료')
