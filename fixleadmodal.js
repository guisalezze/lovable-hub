const fs = require('fs');
let content = fs.readFileSync('src/components/leads/LeadDetailModal.tsx', 'utf8');

const oldEnd = '      </DialogContent>\r\n    </Dialog>\r\n  );\r\n}\r\n';
const newEnd = [
  '      </DialogContent>',
  '    </Dialog>',
  '',
  '    {/* Dialog de criar call pre-preenchida com dados do lead */}',
  '    <CreateCallFromLeadDialog',
  '      open={showCreateCall}',
  '      onOpenChange={setShowCreateCall}',
  '      leadEmail={lead.email}',
  '      leadName={lead.full_name}',
  '    />',
  '    </>',
  '  );',
  '}',
  '',
].join('\r\n');

if (content.includes(oldEnd)) {
  content = content.replace(oldEnd, newEnd);
  fs.writeFileSync('src/components/leads/LeadDetailModal.tsx', content);
  console.log('Done!');
} else {
  console.log('Pattern not found');
}
