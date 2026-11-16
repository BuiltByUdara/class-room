import { expect, it } from 'vitest';
import { driveQuestionImage, questionInputSchema } from '@tuition/contracts';
const id = 'ExampleImageFile12345';
it.each([`https://drive.google.com/file/d/${id}/view?usp=sharing`, `https://drive.google.com/open?id=${id}`, `https://drive.google.com/uc?export=view&id=${id}`, `https://drive.google.com/thumbnail?id=${id}&sz=w300`])('converts supported Drive links: %s', url => {
  expect(driveQuestionImage(url)).toEqual({sourceUrl:`https://drive.google.com/file/d/${id}/view`,imageUrl:`https://drive.google.com/thumbnail?id=${id}&sz=w1600`});
});
it('keeps resource keys but removes unrelated query parameters', () => {
  const result = driveQuestionImage(`https://drive.google.com/file/d/${id}/view?resourcekey=key_123&usp=sharing`)!;
  expect(result.imageUrl).toContain('resourcekey=key_123'); expect(result.sourceUrl).not.toContain('usp=');
});
it.each(['javascript:alert(1)', 'data:image/svg+xml,test', 'https://drive.google.com.evil.test/file/d/ExampleImageFile12345/view', 'https://evil.test/image.png', 'http://drive.google.com/open?id=ExampleImageFile12345', 'https://drive.google.com/drive/folders/ExampleImageFile12345', 'https://user:pass@drive.google.com/open?id=ExampleImageFile12345'])('rejects unsupported links: %s', url => {
  expect(driveQuestionImage(url)).toBeNull();
});
it('keeps existing text-only questions compatible', () => {
  expect(questionInputSchema.safeParse({type:'single',prompt:'Question',topic:'Topic',marks:1,options:[{id:'a',text:'One'},{id:'b',text:'Two'}],correctOptionIds:['a']}).success).toBe(true);
});
