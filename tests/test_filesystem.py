"""Path picker boundaries and durable file/folder references; no model calls."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from cos.filesystem import browse_paths, LIST_LIMIT
from cos.safety import Invalid, local_file, local_reference
from cos.service import Service


class FilesystemTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name).resolve()
        self.work=self.root/'project';self.work.mkdir()
        (self.work/'docs').mkdir()
        (self.work/'sample data.csv').write_text('time,signal\n0,1\n')
        (self.work/'docs/notes.txt').write_text('Synthetic reference')
        (self.work/'.hidden.txt').write_text('Synthetic hidden reference')
        self.protected=[self.root/'storage']

    def tearDown(self):
        self.tmp.cleanup()

    def test_directory_navigation_does_not_select_protected_folders(self):
        data=browse_paths(path=str(self.root),protected=self.protected)
        self.assertFalse(data['selectable'])
        data=browse_paths(path=str(self.work),protected=self.protected)
        self.assertTrue(data['selectable'])
        self.assertEqual([x['name'] for x in data['entries']],['docs'])

    def test_files_and_folders_have_relative_paths_without_reading_contents(self):
        data=browse_paths('references',root=str(self.work),protected=self.protected)
        self.assertEqual([(x['relative'],x['kind']) for x in data['entries']],
                         [('docs','directory'),('sample data.csv','file')])
        self.assertFalse(data['selectable'])
        self.assertIsNone(data['parent'])
        self.assertNotIn('content',data['entries'][1])
        child=browse_paths('references',str(self.work/'docs'),str(self.work))
        self.assertEqual(child['parent'],str(self.work))
        self.assertEqual(child['entries'][0]['relative'],'docs/notes.txt')

    def test_reference_navigation_cannot_escape_root_or_follow_symlinks(self):
        outside=self.root/'outside';outside.mkdir()
        (self.work/'alias').symlink_to(outside,target_is_directory=True)
        for path in [outside,self.work/'../outside',self.work/'alias']:
            with self.subTest(path=path),self.assertRaises(Invalid):
                browse_paths('references',str(path),str(self.work))
        data=browse_paths('references',root=str(self.work))
        alias=next(x for x in data['entries'] if x['name']=='alias')
        self.assertFalse(alias['selectable'])

    def test_working_folder_links_resolve_to_the_real_folder(self):
        alias=self.root/'linked project';alias.symlink_to(self.work,target_is_directory=True)
        listing=browse_paths(path=str(self.root),protected=self.protected)
        entry=next(x for x in listing['entries'] if x['name']=='linked project')
        self.assertEqual(entry['kind'],'directory')
        self.assertTrue(entry['selectable'])
        data=browse_paths(path=str(alias),protected=self.protected)
        self.assertEqual(data['path'],str(self.work))
        self.assertTrue(data['selectable'])

    def test_directory_references_remain_distinct_from_output_files(self):
        self.assertEqual(local_reference(self.work,'docs'),self.work/'docs')
        with self.assertRaises(Invalid):local_file(self.work,'docs')
        for relative in ['.','../outside','docs/../sample data.csv','missing']:
            with self.subTest(relative=relative),self.assertRaises(Invalid):local_reference(self.work,relative)

    def test_resolved_directory_cannot_be_an_ancestor_of_the_project(self):
        (self.work/'parent').symlink_to(self.root,target_is_directory=True)
        # Simulate a junction-like redirect whose metadata isn't a symlink.
        with patch.object(Path,'is_symlink',return_value=False):
            with self.assertRaises(Invalid):local_reference(self.work,'parent')

    def test_large_files_are_unselectable_but_folders_are_not_recursively_imported(self):
        with (self.work/'docs/large.bin').open('wb') as file:file.truncate(8*1024*1024+1)
        data=browse_paths('references',str(self.work/'docs'),str(self.work))
        large=next(x for x in data['entries'] if x['name']=='large.bin')
        self.assertFalse(large['selectable'])
        self.assertEqual(local_reference(self.work,'docs'),self.work/'docs')

    def test_search_hidden_items_and_bounded_results(self):
        data=browse_paths('references',root=str(self.work),query='SAMPLE')
        self.assertEqual([x['name'] for x in data['entries']],['sample data.csv'])
        data=browse_paths('references',root=str(self.work),query='hidden',show_hidden=True)
        self.assertEqual(data['entries'][0]['relative'],'.hidden.txt')
        for i in range(LIST_LIMIT+1):(self.work/f'entry-{i:04d}.txt').touch()
        data=browse_paths('references',root=str(self.work))
        self.assertEqual(len(data['entries']),LIST_LIMIT)
        self.assertTrue(data['truncated'])

    def test_invalid_modes_and_nonlocal_paths_are_refused(self):
        for kwargs in [{'mode':'write'},{'path':'relative'},{'path':'//server/share'},
                       {'mode':'references','root':str(self.root/'storage')},{'show_hidden':'yes'}]:
            with self.subTest(kwargs=kwargs),self.assertRaises((Invalid,FileNotFoundError)):browse_paths(**kwargs)

    def test_folder_references_persist_without_delegating_or_changing_files(self):
        service=Service(self.root/'storage',start=False)
        try:
            project=service.project({'vision':'A synthetic picker test','cwd':str(self.work),
                                     'file_refs':['docs','sample data.csv']})
            self.assertEqual(project['file_refs'],['docs','sample data.csv'])
            self.assertFalse(service.store.all('task'))
            self.assertFalse(service.store.all('plan'))
            self.assertEqual((self.work/'sample data.csv').read_text(),'time,signal\n0,1\n')
            service.close();service=Service(self.root/'storage',start=False)
            self.assertEqual(service.store.get('project',project['id'])['file_refs'],project['file_refs'])
        finally:service.close()


if __name__=='__main__':unittest.main()
